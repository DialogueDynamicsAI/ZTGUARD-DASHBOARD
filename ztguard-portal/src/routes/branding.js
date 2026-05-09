const express = require('express');
const db = require('../db');
const fetch = require('node-fetch');
const router = express.Router();

function getAll() {
  const rows = db.prepare('SELECT key, value FROM branding_config').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function set(key, value) {
  db.prepare(`
    INSERT INTO branding_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// GET all branding config
router.get('/', (req, res) => {
  const config = getAll();
  // Don't send full logo_data in list — just whether it exists
  const { logo_data, ...rest } = config;
  res.json({ ...rest, has_logo: !!logo_data });
});

// GET logo image (raw data)
router.get('/logo', (req, res) => {
  const config = getAll();
  if (!config.logo_data) return res.status(404).send('No logo set');
  const [header, data] = config.logo_data.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  res.set('Content-Type', mime);
  res.send(Buffer.from(data, 'base64'));
});

// POST update branding config
router.post('/', (req, res) => {
  const { org_name, primary_color, login_url, logo_data,
          auth_title, auth_subtitle, custom_css, custom_header_html, custom_footer_html } = req.body;

  if (org_name !== undefined) set('org_name', org_name);
  if (primary_color !== undefined) {
    if (!/^#[0-9a-fA-F]{3,8}$/.test(primary_color)) {
      return res.status(400).json({ error: 'primary_color must be a valid hex color' });
    }
    set('primary_color', primary_color);
  }
  if (login_url !== undefined) set('login_url', login_url);
  if (auth_title !== undefined) set('auth_title', auth_title);
  if (auth_subtitle !== undefined) set('auth_subtitle', auth_subtitle);
  if (custom_css !== undefined) set('custom_css', custom_css);
  if (custom_header_html !== undefined) set('custom_header_html', custom_header_html);
  if (custom_footer_html !== undefined) set('custom_footer_html', custom_footer_html);
  if (logo_data !== undefined) {
    if (logo_data && !logo_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'logo_data must be a base64 data URI' });
    }
    set('logo_data', logo_data);
  }

  // Optionally push branding settings to Pangolin via API
  const apiUrl = process.env.PANGOLIN_API_URL;
  const apiKey = process.env.PANGOLIN_API_KEY;
  const orgId = process.env.PANGOLIN_ORG_ID;

  if (apiUrl && apiKey && orgId && (org_name || primary_color)) {
    const pangolinPayload = {};
    if (org_name) pangolinPayload.name = org_name;

    fetch(`${apiUrl}/org/${orgId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pangolinPayload),
    }).catch(err => console.warn('[branding] Pangolin API update failed:', err.message));
  }

  res.json({ ok: true, config: getAll() });
});

// DELETE logo
router.delete('/logo', (req, res) => {
  set('logo_data', '');
  res.json({ ok: true });
});

module.exports = router;
