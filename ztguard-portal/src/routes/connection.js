const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const router = express.Router();

const CONFIG_KEYS = ['pangolin_url', 'pangolin_api_key', 'pangolin_org_id', 'poll_interval'];

function getConfig() {
  const rows = db.prepare(`SELECT key, value FROM app_config WHERE key IN (${CONFIG_KEYS.map(()=>'?').join(',')})`)
    .all(...CONFIG_KEYS);
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value || '']));
  return {
    pangolin_url:     cfg.pangolin_url     || process.env.PANGOLIN_API_URL?.replace('/v1','') || '',
    pangolin_org_id:  cfg.pangolin_org_id  || process.env.PANGOLIN_ORG_ID || '',
    pangolin_api_key: cfg.pangolin_api_key || process.env.PANGOLIN_API_KEY || '',
    poll_interval:    cfg.poll_interval    || process.env.POLL_INTERVAL_SECONDS || '30',
  };
}

function setConfig(key, value) {
  db.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

function applyConfig(cfg) {
  if (cfg.pangolin_url)     process.env.PANGOLIN_API_URL = cfg.pangolin_url.replace(/\/$/, '') + '/v1';
  if (cfg.pangolin_org_id)  process.env.PANGOLIN_ORG_ID  = cfg.pangolin_org_id;
  if (cfg.pangolin_api_key) process.env.PANGOLIN_API_KEY  = cfg.pangolin_api_key;
  if (cfg.poll_interval)    process.env.POLL_INTERVAL_SECONDS = cfg.poll_interval;
}

// GET /api/connection — return current settings (key masked)
router.get('/', (req, res) => {
  const cfg = getConfig();
  res.json({
    pangolin_url:     cfg.pangolin_url,
    pangolin_org_id:  cfg.pangolin_org_id,
    poll_interval:    cfg.poll_interval,
    api_key_set:      !!cfg.pangolin_api_key,
    api_key_preview:  cfg.pangolin_api_key
      ? cfg.pangolin_api_key.slice(0, 8) + '••••••••' + cfg.pangolin_api_key.slice(-4)
      : '',
  });
});

// POST /api/connection — save settings
router.post('/', (req, res) => {
  const { pangolin_url, pangolin_org_id, pangolin_api_key, poll_interval } = req.body;

  if (pangolin_url !== undefined)     setConfig('pangolin_url',     pangolin_url.replace(/\/$/, ''));
  if (pangolin_org_id !== undefined)  setConfig('pangolin_org_id',  pangolin_org_id);
  if (pangolin_api_key !== undefined && pangolin_api_key !== '') {
    setConfig('pangolin_api_key', pangolin_api_key);
  }
  if (poll_interval !== undefined)    setConfig('poll_interval',    String(poll_interval));

  const cfg = getConfig();
  applyConfig(cfg);
  console.log('[connection] Settings updated:', cfg.pangolin_url, 'org:', cfg.pangolin_org_id);

  res.json({ ok: true, config: { pangolin_url: cfg.pangolin_url, pangolin_org_id: cfg.pangolin_org_id, poll_interval: cfg.poll_interval, api_key_set: !!cfg.pangolin_api_key } });
});

// POST /api/connection/discover — auth with Pangolin, get orgs, create API key
router.post('/discover', async (req, res) => {
  const { server_url, email, password, org_id } = req.body;
  if (!server_url || !email || !password) {
    return res.status(400).json({ error: 'server_url, email, and password are required' });
  }

  const base = server_url.replace(/\/$/, '');
  const apiBase = base + '/api/v1';

  try {
    // Step 1: Login to get session
    const loginResp = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      timeout: 10000,
    });

    if (!loginResp.ok) {
      const body = await loginResp.text();
      return res.status(401).json({ error: `Login failed (${loginResp.status}): ${body.slice(0,200)}` });
    }

    const sessionCookie = loginResp.headers.get('set-cookie');
    if (!sessionCookie) {
      return res.status(401).json({ error: 'Login succeeded but no session cookie returned' });
    }

    const cookieStr = sessionCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');

    // Step 2: Get list of orgs
    const orgsResp = await fetch(`${apiBase}/orgs`, {
      headers: { Cookie: cookieStr },
      timeout: 10000,
    });

    let orgs = [];
    if (orgsResp.ok) {
      const orgsData = await orgsResp.json();
      orgs = (orgsData.data?.orgs || orgsData.orgs || []).map(o => ({
        orgId: o.orgId || o.id,
        name: o.name,
      }));
    }

    // Step 3: If org_id provided, create/get an API key
    let apiKey = null;
    const targetOrg = org_id || (orgs[0] && orgs[0].orgId);

    if (targetOrg) {
      try {
        const keyResp = await fetch(`${apiBase}/org/${targetOrg}/api-key`, {
          method: 'PUT',
          headers: { Cookie: cookieStr, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'ZTGuard Dashboard' }),
          timeout: 10000,
        });
        if (keyResp.ok) {
          const keyData = await keyResp.json();
          apiKey = keyData.data?.apiKey || keyData.apiKey || null;
        }
      } catch (_) {}
    }

    res.json({
      ok: true,
      orgs,
      api_key: apiKey,
      server_url: base,
      message: apiKey
        ? `Connected! Found ${orgs.length} org(s). API key created.`
        : `Connected! Found ${orgs.length} org(s). Create an API key manually in Pangolin → API Keys.`,
    });

  } catch (err) {
    res.status(503).json({ error: `Connection failed: ${err.message}` });
  }
});

// POST /api/connection/test — test the saved API key
router.post('/test', async (req, res) => {
  const cfg = getConfig();
  if (!cfg.pangolin_url || !cfg.pangolin_api_key) {
    return res.status(400).json({ ok: false, error: 'Server URL and API key are required' });
  }

  const apiBase = cfg.pangolin_url.replace(/\/$/, '') + '/v1';
  const orgId = cfg.pangolin_org_id;

  try {
    const start = Date.now();
    const resp = await fetch(`${apiBase}/org/${orgId}`, {
      headers: { Authorization: `Bearer ${cfg.pangolin_api_key}` },
      timeout: 10000,
    });
    const latency = Date.now() - start;

    if (resp.status === 401) return res.json({ ok: false, error: 'API key rejected (401)', latency });
    if (resp.status === 403) return res.json({ ok: false, error: 'Access denied (403) — check API key permissions', latency });
    if (!resp.ok) return res.json({ ok: false, error: `HTTP ${resp.status}`, latency });

    const data = await resp.json();
    const orgName = data.data?.org?.name || data.org?.name || orgId;
    res.json({ ok: true, org_name: orgName, latency, message: `Connected to org "${orgName}" in ${latency}ms` });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = { router, getConfig, applyConfig };
