const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PANGOLIN_DB_PATH = process.env.PANGOLIN_DB_PATH || '/app/pangolin-db/db.sqlite';
const ALERT_INTERVAL_SEC = parseInt(process.env.ALERT_INTERVAL_SECONDS || '60', 10);

function getPangolinDb() {
  if (!fs.existsSync(PANGOLIN_DB_PATH)) return null;
  const Database = require('better-sqlite3');
  return new Database(PANGOLIN_DB_PATH, { readonly: true });
}

function getPangolinSmtp() {
  try {
    const configPath = '/app/pangolin-css/../../../config/config.yml';
    // Try to read SMTP from env (set from Pangolin config)
    return {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || '',
    };
  } catch (_) { return null; }
}

// ── Health Check Runner ──────────────────────────────────────────────────────
async function runHealthCheck(check) {
  const start = Date.now();
  try {
    if (check.type === 'tcp') {
      const [host, portStr] = check.target.split(':');
      const port = parseInt(portStr || '80');
      await new Promise((resolve, reject) => {
        const net = require('net');
        const sock = net.createConnection({ host, port, timeout: check.timeout_sec * 1000 });
        sock.on('connect', () => { sock.destroy(); resolve(); });
        sock.on('error', reject);
        sock.on('timeout', () => { sock.destroy(); reject(new Error('TCP timeout')); });
      });
      return { status: 'healthy', response_ms: Date.now() - start };
    } else {
      const resp = await fetch(check.target, {
        method: check.method || 'GET',
        timeout: check.timeout_sec * 1000,
        headers: { 'User-Agent': 'ZTGuard-HealthCheck/1.0' },
        redirect: 'follow',
      });
      const response_ms = Date.now() - start;
      const expectedStatus = check.expected_status || 200;
      if (resp.status !== expectedStatus) {
        return { status: 'unhealthy', response_ms, error: `HTTP ${resp.status} (expected ${expectedStatus})` };
      }
      if (check.keyword) {
        const body = await resp.text();
        if (!body.includes(check.keyword)) {
          return { status: 'unhealthy', response_ms, error: `Keyword "${check.keyword}" not found in response` };
        }
      }
      return { status: 'healthy', response_ms };
    }
  } catch (err) {
    return { status: 'unhealthy', response_ms: Date.now() - start, error: err.message };
  }
}

// ── Webhook Action ────────────────────────────────────────────────────────────
async function fireWebhook(config, payload) {
  const { url, headers: customHeaders } = config;
  if (!url) return { ok: false, error: 'No URL' };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...customHeaders },
      body: JSON.stringify(payload),
      timeout: 10000,
    });
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Email Action ──────────────────────────────────────────────────────────────
async function fireEmail(config, payload) {
  const { to, subject } = config;
  if (!to) return { ok: false, error: 'No recipient' };
  try {
    const nodemailer = require('nodemailer');
    const smtp = getPangolinSmtp();
    if (!smtp.host) return { ok: false, error: 'SMTP not configured' };

    const transporter = nodemailer.createTransporter({
      host: smtp.host, port: smtp.port, secure: false,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
    const text = `ZTGuard Alert: ${payload.rule_name}\n\n${payload.source_name} is now ${payload.state}\n\nTriggered: ${payload.fired_at}`;
    await transporter.sendMail({
      from: smtp.from || smtp.user,
      to,
      subject: subject || `[ZTGuard] ${payload.rule_name} — ${payload.state}`,
      text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Fire All Actions for a Rule ───────────────────────────────────────────────
async function fireRule(rule, sourceName, state) {
  const now = new Date().toISOString();
  const payload = {
    rule_id: rule.id,
    rule_name: rule.name,
    source_type: rule.source_type,
    source_name: sourceName,
    trigger: rule.trigger,
    state,
    fired_at: now,
    org_id: rule.org_id,
  };

  const actions = db.prepare('SELECT * FROM alert_actions WHERE rule_id = ?').all(rule.id);
  for (const action of actions) {
    let config = {};
    try { config = JSON.parse(action.config); } catch (_) {}

    let result;
    if (action.action_type === 'webhook') result = await fireWebhook(config, payload);
    else if (action.action_type === 'email') result = await fireEmail(config, payload);
    else result = { ok: false, error: 'Unknown action type' };

    db.prepare(`
      INSERT INTO alert_history
        (org_id, rule_id, rule_name, source_type, source_name, trigger, state, action_type, action_result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.org_id, rule.id, rule.name, rule.source_type,
      sourceName, rule.trigger, state, action.action_type,
      JSON.stringify(result)
    );
    console.log(`[alerter] Rule "${rule.name}" fired ${action.action_type} → ${result.ok ? 'OK' : result.error}`);
  }

  // Update last_fired
  db.prepare(`UPDATE alert_rules SET last_fired = ? WHERE id = ?`).run(now, rule.id);
}

// ── Check If Rule Should Fire ─────────────────────────────────────────────────
function shouldFire(rule, newStatus) {
  const trigger = rule.trigger;
  if (trigger === 'any') return true;
  if (trigger === newStatus) return true;
  // Aliases
  if (trigger === 'offline' && newStatus === 'offline') return true;
  if (trigger === 'online' && newStatus === 'online') return true;
  if (trigger === 'unhealthy' && newStatus === 'unhealthy') return true;
  if (trigger === 'healthy' && newStatus === 'healthy') return true;
  return false;
}

function isOnCooldown(rule) {
  if (!rule.cooldown_sec || !rule.last_fired) return false;
  const elapsed = (Date.now() - new Date(rule.last_fired).getTime()) / 1000;
  return elapsed < rule.cooldown_sec;
}

// ── Main Alert Tick ───────────────────────────────────────────────────────────
async function alertTick() {
  try {
    const pdb = getPangolinDb();

    // 1. Sync Pangolin entity states from statusHistory
    if (pdb) {
      try {
        // Get latest status per entity per org
        const latest = pdb.prepare(`
          SELECT entityType, entityId, orgId, status, MAX(timestamp) as ts
          FROM statusHistory
          GROUP BY entityType, entityId, orgId
        `).all();

        for (const row of latest) {
          const entityId = String(row.entityId);
          const prev = db.prepare(
            `SELECT last_status FROM alert_last_state WHERE org_id = ? AND entity_type = ? AND entity_id = ?`
          ).get(row.orgId, row.entityType, entityId);

          const statusChanged = !prev || prev.last_status !== row.status;

          // Update state
          db.prepare(`
            INSERT INTO alert_last_state (org_id, entity_type, entity_id, last_status, last_seen)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(org_id, entity_type, entity_id) DO UPDATE SET last_status = excluded.last_status, last_seen = excluded.last_seen
          `).run(row.orgId, row.entityType, entityId, row.status);

          if (statusChanged && prev) {
            // Get entity name for readable alerts
            let sourceName = `${row.entityType} #${entityId}`;
            try {
              if (row.entityType === 'site') {
                const s = pdb.prepare('SELECT name FROM sites WHERE siteId = ?').get(row.entityId);
                if (s) sourceName = s.name;
              } else if (row.entityType === 'resource') {
                const r = pdb.prepare('SELECT name FROM resources WHERE resourceId = ?').get(row.entityId);
                if (r) sourceName = r.name;
              }
            } catch (_) {}

            // Find matching alert rules
            const rules = db.prepare(`
              SELECT * FROM alert_rules
              WHERE org_id = ? AND enabled = 1
                AND source_type = ?
                AND (source_id = 'all' OR source_id = ?)
            `).all(row.orgId, row.entityType, entityId);

            for (const rule of rules) {
              if (shouldFire(rule, row.status) && !isOnCooldown(rule)) {
                await fireRule(rule, sourceName, row.status);
              }
            }
          }
        }
      } finally {
        pdb.close();
      }
    }

    // 2. Run our own health checks
    const now = Math.floor(Date.now() / 1000);
    const checks = db.prepare(`
      SELECT * FROM health_checks WHERE enabled = 1
    `).all();

    for (const check of checks) {
      // Check if due
      const lastTs = check.last_checked ? Math.floor(new Date(check.last_checked).getTime() / 1000) : 0;
      if (now - lastTs < check.interval_sec) continue;

      const result = await runHealthCheck(check);
      const prevStatus = check.last_status;
      const checkedAt = new Date().toISOString();

      // Update check status
      db.prepare(`
        UPDATE health_checks SET last_status = ?, last_checked = ? WHERE id = ?
      `).run(result.status, checkedAt, check.id);

      // Store history (keep last 200 per check)
      db.prepare(`
        INSERT INTO health_check_history (check_id, org_id, status, response_ms, error)
        VALUES (?, ?, ?, ?, ?)
      `).run(check.id, check.org_id, result.status, result.response_ms || null, result.error || null);
      db.prepare(`
        DELETE FROM health_check_history WHERE check_id = ? AND id NOT IN (
          SELECT id FROM health_check_history WHERE check_id = ? ORDER BY id DESC LIMIT 200
        )
      `).run(check.id, check.id);

      // Update alert_last_state for health checks
      const entityId = 'hc_' + check.id;
      const prevState = db.prepare(
        `SELECT last_status FROM alert_last_state WHERE org_id = ? AND entity_type = 'health_check' AND entity_id = ?`
      ).get(check.org_id, entityId);

      db.prepare(`
        INSERT INTO alert_last_state (org_id, entity_type, entity_id, last_status, last_seen)
        VALUES (?, 'health_check', ?, ?, datetime('now'))
        ON CONFLICT(org_id, entity_type, entity_id) DO UPDATE SET last_status = excluded.last_status, last_seen = excluded.last_seen
      `).run(check.org_id, entityId, result.status);

      // Fire rules if status changed
      if (prevStatus !== 'unknown' && prevStatus !== result.status) {
        const rules = db.prepare(`
          SELECT * FROM alert_rules
          WHERE org_id = ? AND enabled = 1
            AND source_type = 'health_check'
            AND (source_id = 'all' OR source_id = ?)
        `).all(check.org_id, String(check.id));

        for (const rule of rules) {
          if (shouldFire(rule, result.status) && !isOnCooldown(rule)) {
            await fireRule(rule, check.name, result.status);
          }
        }
      }
    }
  } catch (err) {
    console.error('[alerter] Tick error:', err.message);
  }
}

function startAlerter() {
  console.log(`[alerter] Starting — checking every ${ALERT_INTERVAL_SEC}s`);
  setTimeout(() => alertTick(), 10000);
  setInterval(() => alertTick(), ALERT_INTERVAL_SEC * 1000);
}

module.exports = { startAlerter, alertTick, runHealthCheck };
