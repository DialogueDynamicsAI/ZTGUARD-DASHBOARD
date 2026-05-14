const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const router = express.Router();
const db = require('../db');

const BASE = process.env.BASE_PATH || '/ztguard';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCfg(key) {
  const r = db.prepare('SELECT value FROM admin_config WHERE key = ?').get(key);
  return r ? r.value : '';
}
function setCfg(key, value) {
  db.prepare(`INSERT INTO admin_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

async function sendMail(to, subject, html, text) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (_) { return false; }
  const mailCfg = Object.fromEntries(
    db.prepare('SELECT key, value FROM mail_config').all().map(r => [r.key, r.value])
  );
  if (!mailCfg.smtp_host) return false;
  const port = parseInt(mailCfg.smtp_port || '587', 10);
  const tls = mailCfg.smtp_tls || 'starttls';
  const transporter = nodemailer.createTransport({
    host: mailCfg.smtp_host, port,
    secure: tls === 'ssl', requireTLS: tls === 'starttls',
    auth: mailCfg.smtp_user ? { user: mailCfg.smtp_user, pass: mailCfg.smtp_pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
  try {
    await transporter.sendMail({ from: mailCfg.smtp_from || mailCfg.smtp_user, to, subject, html, text });
    db.prepare(`INSERT INTO mail_log (source, recipient, subject, status) VALUES (?, ?, ?, 'sent')`)
      .run('ztguard-system', to, subject);
    return true;
  } catch (err) {
    db.prepare(`INSERT INTO mail_log (source, recipient, subject, status, error) VALUES (?, ?, ?, 'failed', ?)`)
      .run('ztguard-system', to, subject, err.message);
    return false;
  }
}

// ── GET /login ────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect(BASE + '/');
  res.sendFile('login.html', { root: path.join(__dirname, '../../public') });
});

// ── POST /login ───────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!password || !hash) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const twofaEnabled = getCfg('twofa_enabled') === '1';
  const twofaMethod  = getCfg('twofa_method') || 'totp';
  const totpConfirmed = getCfg('totp_confirmed') === '1';

  if (!twofaEnabled || (twofaMethod === 'totp' && !totpConfirmed)) {
    // No 2FA — log in directly
    req.session.authenticated = true;
    return req.session.save(() => res.json({ ok: true, redirect: BASE + '/' }));
  }

  // 2FA required — mark password as verified, wait for code
  req.session.pendingAuth = true;
  req.session.pendingMethod = twofaMethod;

  if (twofaMethod === 'email' || twofaMethod === 'both') {
    // Generate and send email OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min
    db.prepare('DELETE FROM admin_otp_codes WHERE used = 0').run();
    db.prepare('INSERT INTO admin_otp_codes (code_hash, expires_at) VALUES (?, ?)').run(codeHash, expiresAt);
    const adminEmail = getCfg('admin_email');
    if (adminEmail) {
      await sendMail(adminEmail, 'ZTGuard — Your login code',
        `<div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:24px">
          <div style="background:#1e40af;padding:16px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0;font-size:18px">ZTGuard Login Code</h2>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="color:#374151;margin:0 0 16px">Your one-time login code:</p>
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1e40af;text-align:center;padding:16px;background:#eff6ff;border-radius:8px">${code}</div>
            <p style="color:#6b7280;font-size:12px;margin-top:12px">Valid for 10 minutes. Do not share this code.</p>
          </div>
        </div>`,
        `Your ZTGuard login code: ${code} (valid 10 min)`
      );
    }
  }

  return req.session.save(() => res.json({
    ok: false,
    twofa_required: true,
    method: twofaMethod,
    message: twofaMethod === 'email' ? 'Check your email for a 6-digit code' : 'Enter your authenticator code',
  }));
});

// ── POST /login/verify-2fa ────────────────────────────────────────────────────
router.post('/login/verify-2fa', async (req, res) => {
  if (!req.session.pendingAuth) return res.status(401).json({ error: 'No pending auth session' });

  const { code, method } = req.body;
  const preferredMethod = req.session.pendingMethod || 'totp';
  const useMethod = method || preferredMethod;

  if (useMethod === 'totp') {
    let speakeasy;
    try { speakeasy = require('speakeasy'); } catch (_) {
      return res.status(500).json({ error: 'TOTP library not available' });
    }
    const secret = getCfg('totp_secret');
    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 2 });
    if (!valid) return res.status(401).json({ error: 'Invalid authenticator code' });
  } else {
    // Email OTP
    const otpRow = db.prepare(
      'SELECT * FROM admin_otp_codes WHERE used = 0 ORDER BY id DESC LIMIT 1'
    ).get();
    if (!otpRow) return res.status(401).json({ error: 'No OTP pending. Request a new login code.' });
    if (Date.now() > otpRow.expires_at) {
      db.prepare('UPDATE admin_otp_codes SET used = 1 WHERE id = ?').run(otpRow.id);
      return res.status(401).json({ error: 'Code expired. Please sign in again.' });
    }
    const valid = await bcrypt.compare(code, otpRow.code_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid code' });
    db.prepare('UPDATE admin_otp_codes SET used = 1 WHERE id = ?').run(otpRow.id);
  }

  req.session.pendingAuth = false;
  req.session.authenticated = true;
  req.session.save(() => res.json({ ok: true, redirect: BASE + '/' }));
});

// ── POST /logout ──────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true, redirect: BASE + '/login' }));
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password are required' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const hash = process.env.ADMIN_PASSWORD_HASH;
  const valid = await bcrypt.compare(current_password, hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(new_password, 12);
  process.env.ADMIN_PASSWORD_HASH = newHash;
  // Also persist to .env file so it survives restart
  const envPath = require('path').join(__dirname, '../../.env');
  try {
    const fs = require('fs');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('ADMIN_PASSWORD=')) {
      envContent = envContent.replace(/^ADMIN_PASSWORD=.*/m, `ADMIN_PASSWORD=${new_password}`);
    } else {
      envContent += `\nADMIN_PASSWORD=${new_password}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (_) {}

  res.json({ ok: true, message: 'Password changed successfully' });
});

// ── GET /api/auth/admin-settings ─────────────────────────────────────────────
router.get('/api/auth/admin-settings', requireAuth, (req, res) => {
  res.json({
    admin_email:    getCfg('admin_email'),
    twofa_enabled:  getCfg('twofa_enabled') === '1',
    twofa_method:   getCfg('twofa_method') || 'totp',
    totp_confirmed: getCfg('totp_confirmed') === '1',
  });
});

// ── POST /api/auth/admin-settings ────────────────────────────────────────────
router.post('/api/auth/admin-settings', requireAuth, (req, res) => {
  const { admin_email, twofa_method } = req.body;
  if (admin_email !== undefined) setCfg('admin_email', admin_email.trim());
  if (twofa_method !== undefined) setCfg('twofa_method', twofa_method);
  res.json({ ok: true });
});

// ── POST /api/auth/2fa/setup-totp ─────────────────────────────────────────────
router.post('/api/auth/2fa/setup-totp', requireAuth, async (req, res) => {
  let speakeasy, QRCode;
  try { speakeasy = require('speakeasy'); QRCode = require('qrcode'); }
  catch (_) { return res.status(500).json({ error: 'TOTP libraries not installed. Rebuild the container.' }); }

  const secret = speakeasy.generateSecret({ name: 'ZTGuard Dashboard', length: 20 });
  setCfg('totp_secret', secret.base32);
  setCfg('totp_confirmed', '0');

  const otpauthUrl = secret.otpauth_url;
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  res.json({ ok: true, secret: secret.base32, qr: qrDataUrl, otpauth: otpauthUrl });
});

// ── POST /api/auth/2fa/confirm-totp ──────────────────────────────────────────
router.post('/api/auth/2fa/confirm-totp', requireAuth, (req, res) => {
  const { code } = req.body;
  let speakeasy;
  try { speakeasy = require('speakeasy'); } catch (_) { return res.status(500).json({ error: 'TOTP not available' }); }

  const secret = getCfg('totp_secret');
  if (!secret) return res.status(400).json({ error: 'No TOTP secret set. Start setup first.' });

  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 2 });
  if (!valid) return res.status(401).json({ error: 'Invalid code — try again' });

  setCfg('totp_confirmed', '1');
  setCfg('twofa_enabled', '1');
  res.json({ ok: true, message: 'TOTP 2FA enabled successfully' });
});

// ── POST /api/auth/2fa/disable ────────────────────────────────────────────────
router.post('/api/auth/2fa/disable', requireAuth, (req, res) => {
  setCfg('twofa_enabled',  '0');
  setCfg('totp_confirmed', '0');
  setCfg('totp_secret',    '');
  db.prepare('DELETE FROM admin_otp_codes').run();
  res.json({ ok: true, message: '2FA disabled' });
});

// ── POST /api/auth/2fa/send-test-otp ─────────────────────────────────────────
router.post('/api/auth/2fa/send-test-otp', requireAuth, async (req, res) => {
  const adminEmail = getCfg('admin_email');
  if (!adminEmail) return res.status(400).json({ error: 'Set your admin email first' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const sent = await sendMail(adminEmail, 'ZTGuard — OTP Test',
    `<p>Your test OTP: <strong>${code}</strong> (this is just a test — code not saved)</p>`,
    `Your test OTP: ${code}`
  );
  if (!sent) return res.status(500).json({ error: 'Failed to send email. Check Mail Relay settings.' });
  res.json({ ok: true, message: `Test OTP sent to ${adminEmail}` });
});

// ── POST /forgot-password ─────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  // Always return success (don't reveal if email is configured)
  const adminEmail = getCfg('admin_email');
  if (!adminEmail) {
    return res.json({ ok: true, message: 'If an email is configured, a reset link has been sent.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  db.prepare('DELETE FROM admin_reset_tokens WHERE used = 0').run();
  db.prepare('INSERT INTO admin_reset_tokens (token_hash, expires_at) VALUES (?, ?)').run(tokenHash, expiresAt);

  const resetUrl = `${process.env.BASE_URL || ''}${BASE}/reset-password?token=${token}`;
  await sendMail(adminEmail, 'ZTGuard — Password Reset',
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="background:#1e40af;padding:16px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:18px">ZTGuard Password Reset</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p style="color:#374151;margin:0 0 16px">A password reset was requested for the ZTGuard dashboard.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:white;text-decoration:none;border-radius:8px;font-weight:600">Reset Password</a>
        <p style="color:#6b7280;font-size:12px;margin-top:16px">Link expires in 1 hour. If you did not request this, ignore this email.</p>
        <p style="color:#6b7280;font-size:11px;margin-top:8px;word-break:break-all">${resetUrl}</p>
      </div>
    </div>`,
    `Reset your ZTGuard password: ${resetUrl}`
  );

  res.json({ ok: true, message: 'If an email is configured, a reset link has been sent.' });
});

// ── GET /reset-password ───────────────────────────────────────────────────────
router.get('/reset-password', (req, res) => {
  res.sendFile('reset-password.html', { root: path.join(__dirname, '../../public') });
});

// ── POST /reset-password ──────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password)
    return res.status(400).json({ error: 'token and new_password are required' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const rows = db.prepare('SELECT * FROM admin_reset_tokens WHERE used = 0 ORDER BY id DESC').all();
  let matched = null;
  for (const row of rows) {
    if (Date.now() > row.expires_at) continue;
    const valid = await bcrypt.compare(token, row.token_hash);
    if (valid) { matched = row; break; }
  }

  if (!matched) return res.status(401).json({ error: 'Invalid or expired reset token' });

  db.prepare('UPDATE admin_reset_tokens SET used = 1 WHERE id = ?').run(matched.id);

  const newHash = await bcrypt.hash(new_password, 12);
  process.env.ADMIN_PASSWORD_HASH = newHash;

  const envPath = path.join(__dirname, '../../.env');
  try {
    const fs = require('fs');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('ADMIN_PASSWORD=')) {
      envContent = envContent.replace(/^ADMIN_PASSWORD=.*/m, `ADMIN_PASSWORD=${new_password}`);
    } else {
      envContent += `\nADMIN_PASSWORD=${new_password}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (_) {}

  res.json({ ok: true, message: 'Password reset successfully. You can now sign in.' });
});

module.exports = router;
