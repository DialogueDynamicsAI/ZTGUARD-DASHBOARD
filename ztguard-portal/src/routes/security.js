const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');

const router = express.Router();

const CONFIG_PATH = '/app/pangolin-config/config.yml';

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFlag(flagName) {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  const match = content.match(new RegExp(`^\\s+${flagName}:\\s*(true|false)`, 'm'));
  if (!match) return false;
  return match[1] === 'true';
}

function writeFlag(flagName, value) {
  if (!fs.existsSync(CONFIG_PATH)) return false;

  let content = fs.readFileSync(CONFIG_PATH, 'utf8');
  const valueStr = value ? 'true' : 'false';
  const lineRegex = new RegExp(`^(\\s+)${flagName}:.*$`, 'm');

  if (lineRegex.test(content)) {
    content = content.replace(lineRegex, `$1${flagName}: ${valueStr}`);
  } else if (/^flags:/m.test(content)) {
    content = content.replace(/^(flags:\s*\n)/m, `$1    ${flagName}: ${valueStr}\n`);
  } else {
    content = content.trimEnd() + `\n\nflags:\n    ${flagName}: ${valueStr}\n`;
  }

  fs.writeFileSync(CONFIG_PATH, content, 'utf8');
  return true;
}

function restartPangolin() {
  return new Promise((resolve) => {
    exec('docker restart pangolin', { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

// ── GET /api/security — return current Pangolin security flag state ───────────
router.get('/', (req, res) => {
  const configMissing = !fs.existsSync(CONFIG_PATH);

  if (configMissing) {
    return res.json({
      ok: true,
      configMissing: true,
      disable_signup_without_invite: null,
    });
  }

  res.json({
    ok: true,
    configMissing: false,
    disable_signup_without_invite: readFlag('disable_signup_without_invite'),
  });
});

// ── POST /api/security — update flag and restart Pangolin ─────────────────────
router.post('/', async (req, res) => {
  const { disable_signup_without_invite } = req.body;

  if (typeof disable_signup_without_invite !== 'boolean') {
    return res.status(400).json({ error: 'disable_signup_without_invite must be a boolean' });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    return res.status(503).json({
      error: 'Pangolin config.yml is not mounted. Ensure /opt/pangolin/config is mounted as /app/pangolin-config in docker-compose.yml.',
    });
  }

  try {
    const written = writeFlag('disable_signup_without_invite', disable_signup_without_invite);
    if (!written) {
      return res.status(500).json({ error: 'Failed to write config.yml' });
    }

    console.log(`[security] disable_signup_without_invite set to ${disable_signup_without_invite} — restarting Pangolin`);

    const restart = await restartPangolin();
    if (!restart.ok) {
      return res.json({
        ok: true,
        written: true,
        restarted: false,
        warning: `Config written but Pangolin restart failed: ${restart.error}. Restart manually: docker restart pangolin`,
      });
    }

    res.json({
      ok: true,
      written: true,
      restarted: true,
      message: `Setting saved and Pangolin restarted. Public signup is now ${disable_signup_without_invite ? 'disabled' : 'enabled'}.`,
    });
  } catch (err) {
    console.error('[security] Failed to update security settings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
