const express = require('express');
const fs = require('fs');
const db = require('../db');
const { runHealthCheck } = require('../alerter');
const router = express.Router();

const PANGOLIN_DB_PATH = process.env.PANGOLIN_DB_PATH || '/app/pangolin-db/db.sqlite';

function getPangolinDb() {
  if (!fs.existsSync(PANGOLIN_DB_PATH)) return null;
  const Database = require('better-sqlite3');
  return new Database(PANGOLIN_DB_PATH, { readonly: true });
}

// ── GET /api/alerting/status — current state of all monitored entities ────────
router.get('/status', (req, res) => {
  const orgId = req.activeOrg;
  try {
    // Get site and resource status from Pangolin DB
    const entities = [];
    const pdb = getPangolinDb();
    if (pdb) {
      try {
        const sites = pdb.prepare('SELECT siteId, orgId, name, online FROM sites WHERE orgId = ?').all(orgId);
        for (const s of sites) {
          entities.push({ type: 'site', id: String(s.siteId), name: s.name, status: s.online ? 'online' : 'offline' });
        }
        const resources = pdb.prepare('SELECT resourceId, orgId, name, enabled FROM resources WHERE orgId = ?').all(orgId);
        for (const r of resources) {
          const lastState = db.prepare(
            `SELECT last_status FROM alert_last_state WHERE org_id = ? AND entity_type = 'resource' AND entity_id = ?`
          ).get(orgId, String(r.resourceId));
          entities.push({ type: 'resource', id: String(r.resourceId), name: r.name, status: lastState?.last_status || (r.enabled ? 'healthy' : 'disabled') });
        }
      } finally { pdb.close(); }
    }

    // Add health checks
    const checks = db.prepare('SELECT id, name, last_status, last_checked FROM health_checks WHERE org_id = ? AND enabled = 1').all(orgId);
    for (const c of checks) {
      entities.push({ type: 'health_check', id: String(c.id), name: c.name, status: c.last_status || 'unknown', last_checked: c.last_checked });
    }

    res.json({ entities });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// ── HEALTH CHECKS CRUD ────────────────────────────────────────────────────────
router.get('/health-checks', (req, res) => {
  const rows = db.prepare('SELECT * FROM health_checks WHERE org_id = ? ORDER BY created_at DESC').all(req.activeOrg);
  res.json(rows);
});

router.post('/health-checks', (req, res) => {
  const { name, type = 'http', target, method = 'GET', expected_status = 200,
          keyword, interval_sec = 60, timeout_sec = 10 } = req.body;
  if (!name || !target) return res.status(400).json({ error: 'name and target required' });
  const result = db.prepare(`
    INSERT INTO health_checks (org_id, name, type, target, method, expected_status, keyword, interval_sec, timeout_sec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.activeOrg, name, type, target, method, expected_status, keyword || null, interval_sec, timeout_sec);
  res.status(201).json(db.prepare('SELECT * FROM health_checks WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/health-checks/:id', (req, res) => {
  const check = db.prepare('SELECT * FROM health_checks WHERE id = ? AND org_id = ?').get(req.params.id, req.activeOrg);
  if (!check) return res.status(404).json({ error: 'Not found' });
  const merged = { ...check, ...req.body };
  db.prepare(`
    UPDATE health_checks SET name=?, type=?, target=?, method=?, expected_status=?,
      keyword=?, interval_sec=?, timeout_sec=?, enabled=? WHERE id=?
  `).run(merged.name, merged.type, merged.target, merged.method, merged.expected_status,
         merged.keyword||null, merged.interval_sec, merged.timeout_sec, merged.enabled ? 1 : 0, check.id);
  res.json(db.prepare('SELECT * FROM health_checks WHERE id = ?').get(check.id));
});

router.delete('/health-checks/:id', (req, res) => {
  const check = db.prepare('SELECT id FROM health_checks WHERE id = ? AND org_id = ?').get(req.params.id, req.activeOrg);
  if (!check) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM health_checks WHERE id = ?').run(check.id);
  res.json({ ok: true });
});

router.post('/health-checks/:id/test', async (req, res) => {
  const check = db.prepare('SELECT * FROM health_checks WHERE id = ? AND org_id = ?').get(req.params.id, req.activeOrg);
  if (!check) return res.status(404).json({ error: 'Not found' });
  const result = await runHealthCheck(check);
  // Store result
  db.prepare('INSERT INTO health_check_history (check_id, org_id, status, response_ms, error) VALUES (?,?,?,?,?)')
    .run(check.id, check.org_id, result.status, result.response_ms||null, result.error||null);
  db.prepare('UPDATE health_checks SET last_status=?, last_checked=datetime(\'now\') WHERE id=?').run(result.status, check.id);
  res.json({ ...result, check_name: check.name });
});

router.get('/health-checks/:id/history', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM health_check_history WHERE check_id = ? ORDER BY id DESC LIMIT 100'
  ).all(req.params.id);
  res.json(rows);
});

// ── ALERT RULES CRUD ──────────────────────────────────────────────────────────
router.get('/rules', (req, res) => {
  const rules = db.prepare('SELECT * FROM alert_rules WHERE org_id = ? ORDER BY created_at DESC').all(req.activeOrg);
  const result = rules.map(r => ({
    ...r,
    actions: db.prepare('SELECT * FROM alert_actions WHERE rule_id = ?').all(r.id).map(a => ({
      ...a, config: (() => { try { return JSON.parse(a.config); } catch(_) { return {}; } })()
    }))
  }));
  res.json(result);
});

router.post('/rules', (req, res) => {
  const { name, source_type, source_id = 'all', trigger, cooldown_sec = 0, actions = [] } = req.body;
  if (!name || !source_type || !trigger) return res.status(400).json({ error: 'name, source_type, trigger required' });
  const r = db.prepare(`
    INSERT INTO alert_rules (org_id, name, source_type, source_id, trigger, cooldown_sec)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.activeOrg, name, source_type, source_id, trigger, cooldown_sec);
  const ruleId = r.lastInsertRowid;
  for (const a of actions) {
    db.prepare('INSERT INTO alert_actions (rule_id, action_type, config) VALUES (?, ?, ?)')
      .run(ruleId, a.action_type, JSON.stringify(a.config || {}));
  }
  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(ruleId);
  res.status(201).json({
    ...rule,
    actions: db.prepare('SELECT * FROM alert_actions WHERE rule_id = ?').all(ruleId)
  });
});

router.patch('/rules/:id', (req, res) => {
  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ? AND org_id = ?').get(req.params.id, req.activeOrg);
  if (!rule) return res.status(404).json({ error: 'Not found' });
  const m = { ...rule, ...req.body };
  db.prepare(`
    UPDATE alert_rules SET name=?, source_type=?, source_id=?, trigger=?, cooldown_sec=?, enabled=? WHERE id=?
  `).run(m.name, m.source_type, m.source_id, m.trigger, m.cooldown_sec, m.enabled ? 1 : 0, rule.id);

  // Replace actions if provided
  if (req.body.actions) {
    db.prepare('DELETE FROM alert_actions WHERE rule_id = ?').run(rule.id);
    for (const a of req.body.actions) {
      db.prepare('INSERT INTO alert_actions (rule_id, action_type, config) VALUES (?, ?, ?)')
        .run(rule.id, a.action_type, JSON.stringify(a.config || {}));
    }
  }
  res.json(db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(rule.id));
});

router.delete('/rules/:id', (req, res) => {
  const rule = db.prepare('SELECT id FROM alert_rules WHERE id = ? AND org_id = ?').get(req.params.id, req.activeOrg);
  if (!rule) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM alert_rules WHERE id = ?').run(rule.id);
  res.json({ ok: true });
});

// ── ALERT HISTORY ─────────────────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const rows = db.prepare(
    'SELECT * FROM alert_history WHERE org_id = ? ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(req.activeOrg, parseInt(limit), parseInt(offset));
  const total = db.prepare('SELECT COUNT(*) as n FROM alert_history WHERE org_id = ?').get(req.activeOrg);
  res.json({ items: rows, total: total.n });
});

router.delete('/history', (req, res) => {
  db.prepare('DELETE FROM alert_history WHERE org_id = ?').run(req.activeOrg);
  res.json({ ok: true });
});

// ── Pangolin entities for rule builder ────────────────────────────────────────
router.get('/entities', (req, res) => {
  const orgId = req.activeOrg;
  const result = { sites: [], resources: [], health_checks: [] };
  const pdb = getPangolinDb();
  if (pdb) {
    try {
      result.sites = pdb.prepare('SELECT siteId as id, name FROM sites WHERE orgId = ?').all(orgId);
      result.resources = pdb.prepare('SELECT resourceId as id, name FROM resources WHERE orgId = ?').all(orgId);
    } finally { pdb.close(); }
  }
  result.health_checks = db.prepare('SELECT id, name FROM health_checks WHERE org_id = ? AND enabled = 1').all(orgId);
  res.json(result);
});

module.exports = router;
