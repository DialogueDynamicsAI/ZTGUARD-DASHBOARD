const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const IDP_ACTIONS = [
  'createIdp', 'updateIdp', 'deleteIdp', 'listIdps', 'getIdp',
  'createIdpOrg', 'deleteIdpOrg', 'listIdpOrgs', 'updateIdpOrg',
];

function getPangolinBase() {
  return process.env.PANGOLIN_API_URL || 'http://pangolin:3003';
}

function getApiKey() {
  const db = require('../db');
  const row = db.prepare(`SELECT value FROM app_config WHERE key = 'pangolin_api_key'`).get();
  return row?.value || process.env.PANGOLIN_API_KEY || '';
}

async function pangolinFetch(path, options = {}) {
  const key = getApiKey();
  const base = getPangolinBase();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    ...(options.headers || {}),
  };

  // Try internal Docker URL first
  try {
    const r = await fetch(`${base}${path}`, { ...options, headers, timeout: 8000 });
    return r;
  } catch (_) {}

  // Fall back to public HTTPS
  const publicBase = process.env.PANGOLIN_API_URL_PUBLIC?.replace('/v1', '') || '';
  if (publicBase) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    return fetch(`${publicBase}${path}`, { ...options, headers, agent, timeout: 10000 });
  }

  throw new Error('Cannot reach Pangolin API');
}

// Grant IdP actions to the API key in Pangolin's DB via Docker socket
async function grantIdpActions() {
  return new Promise((resolve) => {
    const http = require('http');
    const keyQuery = getApiKey().slice(0, 8); // just for logging

    // Exec into pangolin container to run node script granting actions
    const script = `
      const Database = require('/app/node_modules/better-sqlite3');
      const db = new Database('/app/config/db/db.sqlite');
      const keys = db.prepare('SELECT apiKeyId FROM apiKeys').all();
      const actions = ${JSON.stringify(IDP_ACTIONS)};
      const ins = db.prepare('INSERT OR IGNORE INTO apiKeyActions (apiKeyId, actionId) VALUES (?,?)');
      let added = 0;
      keys.forEach(k => actions.forEach(a => { added += ins.run(k.apiKeyId, a).changes; }));
      console.log('granted ' + added + ' IdP actions');
      db.close();
    `.replace(/\n/g, ' ');

    const execBody = JSON.stringify({
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['node', '-e', script],
    });

    const createReq = http.request({
      socketPath: '/var/run/docker.sock',
      path: '/containers/pangolin/exec',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(execBody) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const exec = JSON.parse(data);
          if (!exec.Id) { console.error('[idp] Failed to create exec:', data); return resolve(false); }
          const startBody = JSON.stringify({ Detach: false, Tty: false });
          const startReq = http.request({
            socketPath: '/var/run/docker.sock',
            path: `/exec/${exec.Id}/start`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(startBody) },
          }, (r2) => {
            let out = '';
            r2.on('data', c => out += c);
            r2.on('end', () => { console.log('[idp] Grant result:', out.toString().trim()); resolve(true); });
          });
          startReq.on('error', e => { console.error('[idp] Exec start error:', e.message); resolve(false); });
          startReq.write(startBody);
          startReq.end();
        } catch (e) { console.error('[idp] Parse exec error:', e.message); resolve(false); }
      });
    });
    createReq.on('error', e => { console.error('[idp] Docker socket error:', e.message); resolve(false); });
    createReq.write(execBody);
    createReq.end();
  });
}

// POST /api/idp/enable — grant IdP actions to all API keys
router.post('/enable', async (req, res) => {
  const ok = await grantIdpActions();
  if (ok) {
    res.json({ ok: true, message: 'IdP actions granted to API key. Identity Providers are now enabled.' });
  } else {
    res.status(500).json({ error: 'Could not grant IdP actions — Docker socket may not be available.' });
  }
});

// GET /api/idp — list configured identity providers
router.get('/', async (req, res) => {
  try {
    const r = await pangolinFetch('/v1/idp');
    const body = await r.json();
    if (r.status === 401 || r.status === 403) {
      return res.status(403).json({ error: 'IdP not enabled. Click Enable first.', needsEnable: true });
    }
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/idp — create a new identity provider
router.post('/', async (req, res) => {
  const { variant, name, clientId, clientSecret, tenantId, authUrl, tokenUrl, scopes, autoProvision } = req.body;

  if (!variant || !name || !clientId || !clientSecret) {
    return res.status(400).json({ error: 'variant, name, clientId, clientSecret are required' });
  }

  // Build auth/token URLs for known providers
  let finalAuthUrl = authUrl;
  let finalTokenUrl = tokenUrl;
  let finalScopes = scopes || 'openid email profile';

  if (variant === 'google') {
    finalAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    finalTokenUrl = 'https://oauth2.googleapis.com/token';
  } else if (variant === 'azure') {
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required for Azure' });
    finalAuthUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
    finalTokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    // Azure needs tenant-scoped scopes
    finalScopes = scopes || 'openid email profile offline_access';
  }

  if (!finalAuthUrl || !finalTokenUrl) {
    return res.status(400).json({ error: 'authUrl and tokenUrl are required for generic OIDC' });
  }

  const payload = {
    variant,
    name,
    clientId,
    clientSecret,
    authUrl: finalAuthUrl,
    tokenUrl: finalTokenUrl,
    scopes: finalScopes,
    identifierPath: 'sub',
    emailPath: 'email',
    namePath: 'name',
    autoProvision: autoProvision !== false,
  };

  try {
    const r = await pangolinFetch('/v1/idp/oidc', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const body = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: body.message || 'Failed to create IdP', detail: body });
    }
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/idp/:id — delete an identity provider
router.delete('/:id', async (req, res) => {
  try {
    const r = await pangolinFetch(`/v1/idp/${req.params.id}`, { method: 'DELETE' });
    const body = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: body.message || 'Failed to delete IdP' });
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
