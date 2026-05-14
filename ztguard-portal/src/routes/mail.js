const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../db');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAll() {
  const rows = db.prepare('SELECT key, value FROM mail_config').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value || '']));
}

function set(key, value) {
  db.prepare(
    `INSERT INTO mail_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function buildTransportConfig(cfg) {
  const port = parseInt(cfg.smtp_port || '587', 10);
  const tls = cfg.smtp_tls || 'starttls';
  return {
    host: cfg.smtp_host,
    port,
    secure: tls === 'ssl',          // true = SSL (465), false = STARTTLS or plain
    requireTLS: tls === 'starttls', // force STARTTLS upgrade on plain port
    auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass } : undefined,
    tls: { rejectUnauthorized: false },
  };
}

// ── GET /api/mail — return current settings (password masked) ────────────────
router.get('/', (req, res) => {
  const cfg = getAll();
  res.json({
    smtp_host:    cfg.smtp_host,
    smtp_port:    cfg.smtp_port,
    smtp_from:    cfg.smtp_from,
    smtp_user:    cfg.smtp_user,
    smtp_pass:    cfg.smtp_pass ? '••••••••' : '',
    smtp_pass_set: !!cfg.smtp_pass,
    smtp_tls:     cfg.smtp_tls,
    smtp_enabled: cfg.smtp_enabled === '1',
  });
});

// ── POST /api/mail — save settings and write to Pangolin config.yml ──────────
router.post('/', (req, res) => {
  const { smtp_host, smtp_port, smtp_from, smtp_user, smtp_pass, smtp_tls, smtp_enabled } = req.body;

  if (smtp_host !== undefined)    set('smtp_host',    smtp_host.trim());
  if (smtp_port !== undefined)    set('smtp_port',    String(smtp_port).trim());
  if (smtp_from !== undefined)    set('smtp_from',    smtp_from.trim());
  if (smtp_user !== undefined)    set('smtp_user',    smtp_user.trim());
  if (smtp_pass !== undefined && smtp_pass !== '••••••••' && smtp_pass !== '')
    set('smtp_pass', smtp_pass);
  if (smtp_tls !== undefined)     set('smtp_tls',     smtp_tls);
  if (smtp_enabled !== undefined) set('smtp_enabled', smtp_enabled ? '1' : '0');

  // Write to Pangolin config.yml if the config file is mounted
  const written = writePangolinMailConfig();

  res.json({ ok: true, pangolin_config_written: written });
});

// ── POST /api/mail/restart — restart Pangolin container ─────────────────────
router.post('/restart', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Restart via Docker socket using the docker CLI (available in PATH on host)
    await execAsync('docker restart pangolin', { timeout: 30000 });
    res.json({ ok: true, message: 'Pangolin restarted successfully' });
  } catch (err) {
    console.error('[mail] Pangolin restart failed:', err.message);
    // Fallback: try via docker socket API directly
    try {
      const http = require('http');
      await new Promise((resolve, reject) => {
        const req2 = http.request({
          socketPath: '/var/run/docker.sock',
          path: '/containers/pangolin/restart',
          method: 'POST',
        }, (r) => {
          if (r.statusCode === 204 || r.statusCode === 200) resolve();
          else reject(new Error(`Docker API returned ${r.statusCode}`));
        });
        req2.on('error', reject);
        req2.setTimeout(30000, () => reject(new Error('timeout')));
        req2.end();
      });
      res.json({ ok: true, message: 'Pangolin restarted via Docker API' });
    } catch (err2) {
      res.status(500).json({ ok: false, error: `Restart failed: ${err2.message}. Restart manually: docker restart pangolin` });
    }
  }
});

// ── POST /api/mail/test — send a test email ───────────────────────────────────
router.post('/test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'recipient "to" is required' });

  const cfg = getAll();
  if (!cfg.smtp_host) return res.status(400).json({ error: 'SMTP host not configured. Save settings first.' });

  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (_) { return res.status(500).json({ error: 'nodemailer not installed. Rebuild the container.' }); }

  const transportConfig = buildTransportConfig(cfg);
  const transporter = nodemailer.createTransport(transportConfig);

  try {
    const info = await transporter.sendMail({
      from: cfg.smtp_from || cfg.smtp_user,
      to,
      subject: 'ZTGuard — SMTP Test Email',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px">
          <div style="background:#1e40af;padding:16px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">ZTGuard Extended Settings</h1>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="color:#111827;font-size:15px">Your SMTP relay is configured correctly.</p>
            <table style="border-collapse:collapse;width:100%;margin-top:12px;font-size:13px">
              <tr><td style="padding:6px 0;color:#6b7280">SMTP Host</td><td style="padding:6px 0;color:#111827">${cfg.smtp_host}:${cfg.smtp_port}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">From</td><td style="padding:6px 0;color:#111827">${cfg.smtp_from || cfg.smtp_user}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Security</td><td style="padding:6px 0;color:#111827">${cfg.smtp_tls.toUpperCase()}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:12px;margin-top:16px">Sent from ZTGuard at ${new Date().toUTCString()}</p>
          </div>
        </div>`,
      text: `ZTGuard SMTP test — relay ${cfg.smtp_host}:${cfg.smtp_port} is working correctly.`,
    });

    console.log(`[mail] Test email sent to ${to}: ${info.messageId}`);
    res.json({ ok: true, message: `Test email sent to ${to}`, messageId: info.messageId });
  } catch (err) {
    console.error('[mail] Test email failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Helper: write email block to Pangolin config.yml ─────────────────────────
function writePangolinMailConfig() {
  const configPath = '/app/pangolin-config/config.yml';
  if (!fs.existsSync(configPath)) {
    console.warn('[mail] Pangolin config.yml not found at', configPath, '— skipping write');
    return false;
  }

  const cfg = getAll();
  try {
    let content = fs.readFileSync(configPath, 'utf8');

    // Build the email block
    const emailBlock = cfg.smtp_enabled === '1' && cfg.smtp_host
      ? [
          '',
          'email:',
          `    smtp_host: "${cfg.smtp_host}"`,
          `    smtp_port: ${cfg.smtp_port || 587}`,
          `    smtp_user: "${cfg.smtp_user}"`,
          `    smtp_pass: "${cfg.smtp_pass}"`,
          `    no_reply: "${cfg.smtp_from}"`,
          `    smtp_secure: ${cfg.smtp_tls === 'ssl' ? 'true' : 'false'}`,
          `    smtp_tls_reject_unauthorized: false`,
        ].join('\n')
      : '';

    // Remove any existing email: block
    content = content.replace(/\n*^email:\n(\s+[^\n]+\n?)*/m, '');
    content = content.trimEnd();

    if (emailBlock) content += '\n' + emailBlock + '\n';

    fs.writeFileSync(configPath, content, 'utf8');
    console.log('[mail] Pangolin config.yml updated with SMTP settings');
    return true;
  } catch (err) {
    console.error('[mail] Failed to write Pangolin config.yml:', err.message);
    return false;
  }
}

module.exports = router;
