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
  // Use direct Docker internal URL for API polling (avoids hairpin NAT issues)
  // pangolin:3003 is the integration API accessible from within the Docker network
  if (cfg.pangolin_url) {
    const directUrl = 'http://pangolin:3003';
    const publicUrl = cfg.pangolin_url.replace(/\/$/, '') + '/v1';
    process.env.PANGOLIN_API_URL = directUrl;
    process.env.PANGOLIN_API_URL_PUBLIC = publicUrl;
  }
  if (cfg.pangolin_org_id)  process.env.PANGOLIN_ORG_ID  = cfg.pangolin_org_id;
  if (cfg.pangolin_api_key) process.env.PANGOLIN_API_KEY  = cfg.pangolin_api_key;
  if (cfg.poll_interval)    process.env.POLL_INTERVAL_SECONDS = cfg.poll_interval;
}

// Try internal Docker URL first, fall back to public HTTPS (handles hairpin NAT)
async function fetchWithFallback(path, options, publicBase) {
  const internalUrl = `http://pangolin:3003${path}`;
  const publicUrl   = publicBase ? `${publicBase}${path}` : null;
  try {
    const r = await fetch(internalUrl, { ...options, timeout: 5000 });
    if (r.ok || r.status === 401 || r.status === 403) return { response: r, url: internalUrl };
  } catch (_) {}
  if (publicUrl) {
    const https = require('https');
    const agent = new https.Agent({ rejectUnauthorized: false });
    const r = await fetch(publicUrl, { ...options, agent, timeout: 8000 });
    return { response: r, url: publicUrl };
  }
  throw new Error('Could not reach Pangolin API (internal or public URL)');
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
  const https = require('https');
  const agent = new https.Agent({ rejectUnauthorized: false });

  // Helper: parse Set-Cookie headers into a cookie jar
  function parseCookies(setCookieHeader) {
    if (!setCookieHeader) return {};
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const jar = {};
    for (const h of headers) {
      const part = h.split(';')[0].trim();
      const eq = part.indexOf('=');
      if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return jar;
  }
  function cookieJarToStr(jar) {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  try {
    // Step 1: GET the login page to obtain CSRF cookie
    const csrfResp = await fetch(`${apiBase}/auth/login`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      agent,
      timeout: 10000,
    }).catch(() => null);

    let cookieJar = {};
    let csrfToken = '';
    if (csrfResp) {
      const raw = csrfResp.headers.raw?.()['set-cookie'] || csrfResp.headers.get('set-cookie');
      cookieJar = parseCookies(raw);
      // CSRF token is typically in a cookie named _csrf or x-csrf-token
      csrfToken = cookieJar['_csrf'] || cookieJar['csrfToken'] || '';
    }

    // Step 2: POST login with CSRF token
    const loginResp = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieJarToStr(cookieJar),
        'X-CSRF-Token': csrfToken,
        'Origin': base,
        'Referer': `${base}/auth/login`,
      },
      body: JSON.stringify({ email, password }),
      agent,
      timeout: 10000,
    });

    if (!loginResp.ok) {
      const body = await loginResp.text();
      // If CSRF still fails, inform user to use manual API key entry
      if (loginResp.status === 403 || body.includes('CSRF')) {
        return res.status(401).json({
          error: 'Auto-discover cannot bypass Pangolin CSRF protection. ' +
                 'Please generate an API key manually in Pangolin → Organization → API Keys, ' +
                 'then paste it in the API Key field below.',
          manual: true,
        });
      }
      return res.status(401).json({ error: `Login failed (${loginResp.status}): ${body.slice(0, 200)}` });
    }

    // Merge session cookies
    const loginCookieRaw = loginResp.headers.raw?.()['set-cookie'] || loginResp.headers.get('set-cookie');
    Object.assign(cookieJar, parseCookies(loginCookieRaw));
    const cookieStr = cookieJarToStr(cookieJar);

    // Step 3: Get list of orgs
    const orgsResp = await fetch(`${apiBase}/orgs`, {
      headers: { Cookie: cookieStr },
      agent,
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

    // Step 4: Create API key for the target org
    let apiKey = null;
    const targetOrg = org_id || (orgs[0] && orgs[0].orgId);

    if (targetOrg) {
      try {
        const keyResp = await fetch(`${apiBase}/org/${targetOrg}/api-key`, {
          method: 'PUT',
          headers: {
            Cookie: cookieStr,
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'Origin': base,
          },
          body: JSON.stringify({ name: 'ZTGuard Dashboard' }),
          agent,
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
        : `Connected! Found ${orgs.length} org(s). Generate an API key in Pangolin → Organization → API Keys.`,
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

  const publicBase = cfg.pangolin_url.replace(/\/$/, '') + '/v1';
  const orgId = cfg.pangolin_org_id;
  const headers = { Authorization: `Bearer ${cfg.pangolin_api_key}` };

  try {
    const start = Date.now();
    const { response: resp, url } = await fetchWithFallback(`/v1/org/${orgId}`, { headers }, publicBase);
    const latency = Date.now() - start;

    if (resp.status === 401) return res.json({ ok: false, error: 'API key rejected (401)', latency });
    if (resp.status === 403) return res.json({ ok: false, error: 'Access denied (403) — check API key permissions', latency });
    if (!resp.ok) return res.json({ ok: false, error: `HTTP ${resp.status}`, latency });

    const data = await resp.json();
    const orgName = data.data?.org?.name || data.org?.name || orgId;
    const via = url.includes('pangolin:3003') ? 'internal' : 'public';
    res.json({ ok: true, org_name: orgName, latency, message: `Connected to org "${orgName}" in ${latency}ms (via ${via})` });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = { router, getConfig, applyConfig };
