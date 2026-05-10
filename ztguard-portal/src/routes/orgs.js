const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const PANGOLIN_DB = process.env.PANGOLIN_DB_PATH || '/app/pangolin-db/db.sqlite';
const DEFAULT_ORG = process.env.PANGOLIN_ORG_ID || 'default';

function getPangolinDb() {
  if (!fs.existsSync(PANGOLIN_DB)) return null;
  const Database = require('better-sqlite3');
  return new Database(PANGOLIN_DB, { readonly: true });
}

// GET /api/orgs — list all orgs from Pangolin DB
router.get('/', (req, res) => {
  try {
    const pdb = getPangolinDb();
    if (!pdb) {
      // Fallback: return just the configured default org
      return res.json([{ orgId: DEFAULT_ORG, name: DEFAULT_ORG }]);
    }
    const orgs = pdb.prepare('SELECT orgId, name FROM orgs ORDER BY name').all();
    pdb.close();
    res.json(orgs.length ? orgs : [{ orgId: DEFAULT_ORG, name: DEFAULT_ORG }]);
  } catch (err) {
    console.error('[orgs] Failed to read orgs:', err.message);
    res.json([{ orgId: DEFAULT_ORG, name: DEFAULT_ORG }]);
  }
});

// GET /api/orgs/active — return the current session's active org
router.get('/active', (req, res) => {
  const activeOrg = req.session.activeOrg || DEFAULT_ORG;
  // Also return the org name if we can look it up
  let orgName = activeOrg;
  try {
    const pdb = getPangolinDb();
    if (pdb) {
      const row = pdb.prepare('SELECT name FROM orgs WHERE orgId = ?').get(activeOrg);
      if (row) orgName = row.name;
      pdb.close();
    }
  } catch (_) {}
  res.json({ orgId: activeOrg, name: orgName });
});

// POST /api/orgs/switch — switch the active org for this session
router.post('/switch', (req, res) => {
  const { orgId } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  // Validate org exists
  try {
    const pdb = getPangolinDb();
    if (pdb) {
      const row = pdb.prepare('SELECT orgId FROM orgs WHERE orgId = ?').get(orgId);
      pdb.close();
      if (!row) return res.status(404).json({ error: `Org '${orgId}' not found` });
    }
  } catch (_) {}

  req.session.activeOrg = orgId;
  req.session.save(() => {
    // Seed cursors for the new org if they don't exist
    const db = require('../db');
    const LOG_TYPES = ['request', 'action', 'access', 'connection'];
    const insertCursor = db.prepare(
      `INSERT OR IGNORE INTO cursors (org_id, log_type, last_ts) VALUES (?, ?, 0)`
    );
    for (const t of LOG_TYPES) insertCursor.run(orgId, t);

    // Seed default branding for the new org if it doesn't exist
    const BRANDING_DEFAULTS = [
      ['org_name', orgId],
      ['primary_color', '#2563eb'],
      ['logo_data', ''],
      ['login_url', ''],
      ['auth_title', 'Authenticate to access {{resourceName}}'],
      ['auth_subtitle', 'Choose your preferred authentication method for {{resourceName}}'],
      ['custom_css', ''],
      ['custom_header_html', ''],
      ['custom_footer_html', ''],
      ['login_theme', 'light'],
      ['hide_attribution', '1'],
    ];
    const insertBranding = db.prepare(
      `INSERT OR IGNORE INTO branding_config (org_id, key, value) VALUES (?, ?, ?)`
    );
    for (const [key, value] of BRANDING_DEFAULTS) {
      insertBranding.run(orgId, key, value);
    }

    res.json({ ok: true, orgId, switched: true });
  });
});

module.exports = router;
