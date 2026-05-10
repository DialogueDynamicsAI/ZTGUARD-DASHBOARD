const express = require('express');
const db = require('../db');
const { sendTestPayload } = require('../forwarder');
const router = express.Router();

const VALID_AUTH_TYPES = ['none', 'bearer', 'basic', 'custom'];
const VALID_LOG_TYPES = ['request', 'action', 'access', 'connection'];

function validateDestination(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('name is required');
  if (!body.url || !body.url.trim()) errors.push('url is required');
  try { new URL(body.url); } catch (_) { errors.push('url must be a valid URL'); }
  if (body.auth_type && !VALID_AUTH_TYPES.includes(body.auth_type)) {
    errors.push(`auth_type must be one of: ${VALID_AUTH_TYPES.join(', ')}`);
  }
  let logTypes = [];
  try {
    logTypes = typeof body.log_types === 'string' ? JSON.parse(body.log_types) : body.log_types;
    if (!Array.isArray(logTypes) || logTypes.length === 0) errors.push('at least one log_type required');
    for (const t of logTypes) {
      if (!VALID_LOG_TYPES.includes(t)) errors.push(`invalid log_type: ${t}`);
    }
  } catch (_) {
    errors.push('log_types must be a JSON array');
  }
  return { errors, logTypes };
}

// GET all destinations for active org
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM destinations WHERE org_id = ? ORDER BY created_at DESC'
  ).all(req.activeOrg);
  res.json(rows.map(r => ({ ...r, log_types: JSON.parse(r.log_types) })));
});

// GET single destination (must belong to active org)
router.get('/:id', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM destinations WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.activeOrg);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, log_types: JSON.parse(row.log_types) });
});

// POST create destination
router.post('/', (req, res) => {
  const { errors, logTypes } = validateDestination(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const result = db.prepare(`
    INSERT INTO destinations (org_id, name, url, auth_type, auth_value, log_types, active)
    VALUES (@org_id, @name, @url, @auth_type, @auth_value, @log_types, @active)
  `).run({
    org_id: req.activeOrg,
    name: req.body.name.trim(),
    url: req.body.url.trim(),
    auth_type: req.body.auth_type || 'none',
    auth_value: req.body.auth_value || null,
    log_types: JSON.stringify(logTypes),
    active: req.body.active !== false ? 1 : 0,
  });

  const created = db.prepare('SELECT * FROM destinations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...created, log_types: JSON.parse(created.log_types) });
});

// PATCH update destination
router.patch('/:id', (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM destinations WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.activeOrg);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const merged = { ...existing, ...req.body };
  const { errors, logTypes } = validateDestination(merged);
  if (errors.length) return res.status(400).json({ errors });

  db.prepare(`
    UPDATE destinations SET
      name = @name, url = @url, auth_type = @auth_type, auth_value = @auth_value,
      log_types = @log_types, active = @active, updated_at = datetime('now')
    WHERE id = @id AND org_id = @org_id
  `).run({
    id: req.params.id,
    org_id: req.activeOrg,
    name: merged.name.trim(),
    url: merged.url.trim(),
    auth_type: merged.auth_type || 'none',
    auth_value: merged.auth_value || null,
    log_types: JSON.stringify(logTypes),
    active: merged.active !== false && merged.active !== 0 ? 1 : 0,
  });

  const updated = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  res.json({ ...updated, log_types: JSON.parse(updated.log_types) });
});

// DELETE destination
router.delete('/:id', (req, res) => {
  const row = db.prepare(
    'SELECT id FROM destinations WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.activeOrg);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM destinations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST test destination
router.post('/:id/test', async (req, res) => {
  const dest = db.prepare(
    'SELECT * FROM destinations WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.activeOrg);
  if (!dest) return res.status(404).json({ error: 'Not found' });
  const result = await sendTestPayload(dest);
  res.json(result);
});

module.exports = router;
