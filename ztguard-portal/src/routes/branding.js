const express = require('express');
const db = require('../db');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const BRAND_LOGOS_DIR = process.env.BRAND_LOGOS_DIR || '/app/brand-logos';
const PANGOLIN_CSS_PATH = process.env.PANGOLIN_CSS_PATH || '/app/pangolin-css/4b2b6ba26710cf1d.css';
const PANGOLIN_CONFIG_PATH = '/app/pangolin-config/config.yml';

// Patch Pangolin's compiled server.mjs to use a custom email logo URL
function updatePangolinEmailLogo(logoUrl) {
  const serverMjsPath = '/app/dist/server.mjs';
  if (!fs.existsSync(serverMjsPath)) {
    console.warn('[branding] server.mjs not found — skipping email logo patch');
    return false;
  }
  try {
    let content = fs.readFileSync(serverMjsPath, 'utf8');
    // Replace any existing image URL in EmailLetterHead
    const urlPattern = /src:\s*"https:\/\/[^"]*(?:fossorial-public-assets|ztguard\.net\/images)[^"]*"/;
    if (urlPattern.test(content)) {
      content = content.replace(urlPattern, `src: "${logoUrl}"`);
    } else {
      // Fallback: replace the specific S3 URL
      const s3Url = 'https://fossorial-public-assets.s3.us-east-1.amazonaws.com/word_mark_black.png';
      if (content.includes(s3Url)) {
        content = content.replace(s3Url, logoUrl);
      }
    }
    fs.writeFileSync(serverMjsPath, content, 'utf8');
    console.log('[branding] Email logo URL updated in server.mjs:', logoUrl);
    return true;
  } catch (err) {
    console.error('[branding] Failed to update email logo:', err.message);
    return false;
  }
}

// Write email sender name to Pangolin config.yml
function updatePangolinEmailSender(senderName) {
  if (!fs.existsSync(PANGOLIN_CONFIG_PATH)) return false;
  try {
    let content = fs.readFileSync(PANGOLIN_CONFIG_PATH, 'utf8');
    const smtpFrom = content.match(/smtp_from:\s*"([^"]*)"/)?.[1] || '';
    const baseEmail = smtpFrom.replace(/^.*<|>$/g, '') || smtpFrom;
    const newValue = baseEmail ? `${senderName} <${baseEmail}>` : senderName;
    if (content.includes('no_reply:')) {
      content = content.replace(/no_reply:\s*"[^"]*"/, `no_reply: "${newValue}"`);
    }
    // Also update smtp_from display name
    if (smtpFrom) {
      content = content.replace(/smtp_from:\s*"[^"]*"/, `smtp_from: "${newValue}"`);
    }
    fs.writeFileSync(PANGOLIN_CONFIG_PATH, content, 'utf8');
    console.log('[branding] Updated Pangolin email sender name:', newValue);
    return true;
  } catch (err) {
    console.error('[branding] Failed to update email sender:', err.message);
    return false;
  }
}
const PANGOLIN_JS_CHUNK = '/app/pangolin-css/auth-resource-page-patched-new.js';
const PANGOLIN_JS_ORIG  = '/app/pangolin-css/auth-resource-page-orig.js';
const PANGOLIN_JS_CLEAN = '/app/pangolin-css/auth-resource-page-patched.js';

// Sidebar branding JS (Buy Supporter Key panel)
const SIDEBAR_JS_CHUNK   = '/app/pangolin-css/sidebar-chunk-active.js';
const SIDEBAR_JS_ORIG    = '/app/pangolin-css/sidebar-chunk.js';
const SIDEBAR_JS_PATCHED = '/app/pangolin-css/sidebar-chunk-patched.js';

function updateSidebarJs(hide) {
  try {
    const src = hide ? SIDEBAR_JS_PATCHED : SIDEBAR_JS_ORIG;
    if (!fs.existsSync(src)) {
      console.warn('[branding] Sidebar JS source not found:', src);
      return false;
    }
    fs.copyFileSync(src, SIDEBAR_JS_CHUNK);
    console.log(`[branding] Sidebar JS updated — hide: ${hide}`);
    return true;
  } catch (err) {
    console.error('[branding] Sidebar JS update failed:', err.message);
    return false;
  }
}

function updateAttributionJs(hide) {
  try {
    const src = hide ? PANGOLIN_JS_CLEAN : PANGOLIN_JS_ORIG;
    if (!fs.existsSync(src)) {
      console.warn('[branding] JS source not found:', src);
      return false;
    }
    fs.copyFileSync(src, PANGOLIN_JS_CHUNK);
    console.log(`[branding] Attribution JS updated — hide: ${hide}`);
    return true;
  } catch (err) {
    console.error('[branding] JS update failed:', err.message);
    return false;
  }
}

const DARK_THEME_CSS = `
/* ================================================================
   ZTGuard Dark Theme — ztguard.net dark navy + green button
   ================================================================ */
:root{--primary:oklch(72.3% .219 149.579);--primary-foreground:oklch(12% .04 155);--ring:oklch(72.3% .219 149.579);}
html::before{content:'';position:fixed;inset:0;z-index:-1;background:linear-gradient(135deg,#0a0f1e 0%,#0d1526 50%,#0a1a40 100%);}
html::after{content:'';position:fixed;top:-200px;right:-200px;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 70%);z-index:-1;pointer-events:none;}
html,body{font-family:'Inter',system-ui,sans-serif !important;background:#0a0f1e !important;}
#__next,main,.min-h-screen{background:transparent !important;}
.rounded-xl.border,.rounded-lg.border{background:#0d1526 !important;border-color:rgba(59,130,246,0.25) !important;box-shadow:0 0 0 1px rgba(59,130,246,0.1),0 20px 60px rgba(0,0,0,0.5) !important;}
div:has(> img[src*='word_mark']){background:#0a0f1e !important;padding:22px 28px 20px !important;border-radius:0.75rem 0.75rem 0 0 !important;border-bottom:1px solid rgba(59,130,246,0.2) !important;margin:-1px -1px 0 -1px !important;}
div:has(> img[src*='word_mark']) ~ p{color:rgba(255,255,255,0.55) !important;}
.rounded-xl.border > div:last-child,.rounded-lg.border > div:last-child{background:#0d1526 !important;}
label{color:rgba(255,255,255,0.7) !important;font-size:13px !important;font-weight:500 !important;}
input[type='email'],input[type='password'],input[type='text'],input{background:rgba(255,255,255,0.05) !important;border-color:rgba(255,255,255,0.12) !important;color:#ffffff !important;border-radius:8px !important;}
input::placeholder{color:rgba(255,255,255,0.25) !important;}
input:focus{background:rgba(255,255,255,0.08) !important;border-color:#3b82f6 !important;box-shadow:0 0 0 3px rgba(59,130,246,0.18) !important;}
button.bg-primary{background:#10b981 !important;color:#fff !important;border-radius:8px !important;font-weight:700 !important;border:none !important;}
button.bg-primary:hover{background:#059669 !important;}
button:not(.bg-primary):not([type='button']){background:transparent !important;border-color:rgba(255,255,255,0.18) !important;color:rgba(255,255,255,0.7) !important;border-radius:8px !important;}
.text-muted-foreground{color:rgba(255,255,255,0.38) !important;}
[role='separator']{background-color:rgba(255,255,255,0.1) !important;}
footer,footer *{color:rgba(255,255,255,0.22) !important;}
`;

const LIGHT_THEME_CSS = `
/* ================================================================
   ZTGuard Light Theme — clean white card, branded button
   ================================================================ */
:root{--primary:oklch(54.6% .245 262.881);--primary-foreground:oklch(98% 0.003 255);--ring:oklch(62.3% .214 259.815);}
html,body{font-family:'Inter',system-ui,sans-serif !important;background:#f1f5f9 !important;}
.rounded-xl.border,.rounded-lg.border{background:#ffffff !important;border-color:#e2e8f0 !important;box-shadow:0 4px 24px rgba(0,0,0,0.08) !important;}
div:has(> img[src*='word_mark']){background:#ffffff !important;padding:22px 28px 20px !important;border-radius:0.75rem 0.75rem 0 0 !important;border-bottom:1px solid #e2e8f0 !important;margin:-1px -1px 0 -1px !important;}
input[type='email'],input[type='password'],input[type='text'],input{background:#ffffff !important;border-color:#e2e8f0 !important;color:#0f172a !important;border-radius:8px !important;}
input:focus{border-color:#2563eb !important;box-shadow:0 0 0 3px rgba(37,99,235,0.12) !important;}
button.bg-primary{background:#2563eb !important;color:#fff !important;border-radius:8px !important;font-weight:700 !important;border:none !important;}
button.bg-primary:hover{background:#1d4ed8 !important;}
`;

const HIDE_SIDEBAR_CSS = `
/* === Hide Pangolin sidebar branding ===
   Community Edition link (a[href*="github.com/fosrl/pangolin"])
   Buy Supporter Key button handled via JS chunk patch (sidebar-chunk-active.js)
*/
a[href*="github.com/fosrl/pangolin"] { display:none !important; }
/* The text/div wrapping the Community Edition link */
div:has(> a[href*="github.com/fosrl/pangolin"]) { display:none !important; }
`;

const HIDE_ATTRIBUTION_CSS = `
/* === Hide Pangolin Attribution (safe selectors only) ===
   Source-verified from Pangolin 1.18.3:
   Container class: .container.text-xs.text-neutral-400 with .space-x-4
   Never use *:has() — too broad, hides entire page
*/
/* "Powered by Pangolin" — exact class combo from Pangolin source */
.container.text-xs.text-neutral-400 { display:none !important; }
.space-x-4.text-xs.text-neutral-400 { display:none !important; }
/* The link directly */
a[href="https://pangolin.net"] { display:none !important; }
a[aria-label="Built by Fossorial"] { display:none !important; }
/* "Server is running without a supporter key" — CSS fallback */
.text-center.text-xs.text-muted-foreground:last-child { display:none !important; }
`;

function writePangolinCss(theme) {
  const cssDir = path.dirname(PANGOLIN_CSS_PATH);
  if (!fs.existsSync(cssDir)) return;

  try {
    // Read base Pangolin CSS (everything before our override marker)
    let base = '';
    if (fs.existsSync(PANGOLIN_CSS_PATH)) {
      const full = fs.readFileSync(PANGOLIN_CSS_PATH, 'utf8');
      const marker = '/* ===';
      const idx = full.indexOf(marker);
      base = idx !== -1 ? full.slice(0, idx) : full;
    }

    const themeCSS = theme === 'light' ? LIGHT_THEME_CSS : DARK_THEME_CSS;
    const hideRow = db.prepare("SELECT value FROM branding_config WHERE key='hide_attribution'").get();
    const hideAttr = hideRow && hideRow.value === '1';
    const hideSidebarRow = db.prepare("SELECT value FROM branding_config WHERE key='hide_sidebar_branding'").get();
    const hideSidebar = hideSidebarRow && hideSidebarRow.value === '1';
    fs.writeFileSync(
      PANGOLIN_CSS_PATH,
      base + themeCSS + (hideAttr ? HIDE_ATTRIBUTION_CSS : '') + (hideSidebar ? HIDE_SIDEBAR_CSS : ''),
      'utf8'
    );
    console.log(`[branding] Pangolin CSS updated to ${theme} theme`);
    return true;
  } catch (err) {
    console.error('[branding] CSS write failed:', err.message);
    return false;
  }
}

async function regenerateWordmarks(logoDataUri) {
  try {
    const Jimp = require('jimp');

    // Decode base64 logo
    const [header, b64] = logoDataUri.split(',');
    const imgBuffer = Buffer.from(b64, 'base64');
    const src = await Jimp.read(imgBuffer);
    const { width, height } = src.bitmap;

    // Detect if image already has proper transparency by checking for black opaque pixels
    let blackOpaquePixels = 0, totalOpaque = 0;
    for (let i = 0; i < src.bitmap.data.length; i += 4) {
      if (src.bitmap.data[i + 3] > 200) {
        totalOpaque++;
        if (src.bitmap.data[i] < 25 && src.bitmap.data[i+1] < 25 && src.bitmap.data[i+2] < 25)
          blackOpaquePixels++;
      }
    }
    const hasBlackBg = totalOpaque > 0 && (blackOpaquePixels / totalOpaque) > 0.05;

    if (hasBlackBg) {
      // Screen-mode background removal + white->dark navy conversion
      src.scan(0, 0, width, height, function(x, y, idx) {
        const r = this.bitmap.data[idx];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        const brightness = Math.max(r, g, b) / 255;

        if (brightness < 0.02) {
          this.bitmap.data[idx + 3] = 0;
          return;
        }

        const alpha = Math.round(brightness * 255);
        const nr = Math.min(255, Math.round(r / brightness));
        const ng = Math.min(255, Math.round(g / brightness));
        const nb = Math.min(255, Math.round(b / brightness));

        if (nr > 200 && ng > 200 && nb > 200) {
          this.bitmap.data[idx]     = 30;
          this.bitmap.data[idx + 1] = 41;
          this.bitmap.data[idx + 2] = 59;
        } else {
          this.bitmap.data[idx]     = nr;
          this.bitmap.data[idx + 1] = ng;
          this.bitmap.data[idx + 2] = nb;
        }
        this.bitmap.data[idx + 3] = alpha;
      });
    }
    // else: image already has correct transparency — use as-is

    // Auto-crop, then save at required dimensions
    src.autocrop({ tolerance: 0.01, cropOnlyFrames: false });

    const sizes = [
      { w: 895, h: 224, file: 'word_mark_black.png' },
      { w: 896, h: 224, file: 'word_mark_white.png' },
      { w: 1315, h: 434, file: 'word_mark.png' },
    ];

    if (!fs.existsSync(BRAND_LOGOS_DIR)) {
      fs.mkdirSync(BRAND_LOGOS_DIR, { recursive: true });
    }

    for (const { w, h, file } of sizes) {
      const canvas = new Jimp(w, h, 0x00000000);
      const pad = 10;
      const ratio = Math.min((w - pad * 2) / src.bitmap.width, (h - pad * 2) / src.bitmap.height);
      const nw = Math.round(src.bitmap.width * ratio);
      const nh = Math.round(src.bitmap.height * ratio);
      const clone = src.clone().resize(nw, nh, Jimp.RESIZE_LANCZOS3);
      const x = Math.round((w - nw) / 2);
      const y = Math.round((h - nh) / 2);
      canvas.composite(clone, x, y);
      await canvas.writeAsync(path.join(BRAND_LOGOS_DIR, file));
    }

    console.log('[branding] Wordmarks regenerated successfully');
    return true;
  } catch (err) {
    console.error('[branding] Wordmark regeneration failed:', err.message);
    return false;
  }
}

function getAll(orgId) {
  const rows = db.prepare('SELECT key, value FROM branding_config WHERE org_id = ?').all(orgId);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function set(orgId, key, value) {
  db.prepare(`
    INSERT INTO branding_config (org_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value
  `).run(orgId, key, value);
}

// GET all branding config
router.get('/', (req, res) => {
  const orgId = req.activeOrg;
  const config = getAll(orgId);
  const { logo_data, ...rest } = config;
  let jsPatched = false;
  try {
    if (fs.existsSync(PANGOLIN_JS_CHUNK) && fs.existsSync(PANGOLIN_JS_CLEAN)) {
      const current = fs.readFileSync(PANGOLIN_JS_CHUNK, 'utf8');
      const patched = fs.readFileSync(PANGOLIN_JS_CLEAN, 'utf8');
      jsPatched = current === patched;
    }
  } catch (_) {}
  res.json({ ...rest, has_logo: !!logo_data, js_attribution_hidden: jsPatched, active_org: orgId });
});

// GET logo image (raw data)
router.get('/logo', (req, res) => {
  const config = getAll(req.activeOrg);
  if (!config.logo_data) return res.status(404).send('No logo set');
  const [header, data] = config.logo_data.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  res.set('Content-Type', mime);
  res.send(Buffer.from(data, 'base64'));
});

// POST update branding config
router.post('/', (req, res) => {
  const orgId = req.activeOrg;
  const { org_name, primary_color, login_url, logo_data,
          auth_title, auth_subtitle, custom_css, custom_header_html, custom_footer_html,
          login_theme, hide_attribution, hide_sidebar_branding,
          email_sender_name, email_use_logo, email_logo_url } = req.body;

  if (org_name !== undefined) set(orgId, 'org_name', org_name);
  if (primary_color !== undefined) {
    if (!/^#[0-9a-fA-F]{3,8}$/.test(primary_color)) {
      return res.status(400).json({ error: 'primary_color must be a valid hex color' });
    }
    set(orgId, 'primary_color', primary_color);
  }
  if (login_url !== undefined) set(orgId, 'login_url', login_url);
  if (auth_title !== undefined) set(orgId, 'auth_title', auth_title);
  if (auth_subtitle !== undefined) set(orgId, 'auth_subtitle', auth_subtitle);
  if (custom_css !== undefined) set(orgId, 'custom_css', custom_css);
  if (custom_header_html !== undefined) set(orgId, 'custom_header_html', custom_header_html);
  if (custom_footer_html !== undefined) set(orgId, 'custom_footer_html', custom_footer_html);
  if (login_theme !== undefined && ['light', 'dark'].includes(login_theme)) {
    set(orgId, 'login_theme', login_theme);
    writePangolinCss(login_theme);
  }
  if (hide_attribution !== undefined) {
    set(orgId, 'hide_attribution', hide_attribution ? '1' : '0');
    const currentTheme = db.prepare("SELECT value FROM branding_config WHERE org_id = ? AND key = 'login_theme'").get(orgId);
    writePangolinCss((currentTheme && currentTheme.value) || 'dark');
    updateAttributionJs(hide_attribution);
  }
  if (hide_sidebar_branding !== undefined) {
    set(orgId, 'hide_sidebar_branding', hide_sidebar_branding ? '1' : '0');
    updateSidebarJs(hide_sidebar_branding);
    const currentTheme = db.prepare("SELECT value FROM branding_config WHERE org_id = ? AND key = 'login_theme'").get(orgId);
    writePangolinCss((currentTheme && currentTheme.value) || 'light');
  }
  if (logo_data !== undefined) {
    if (logo_data && !logo_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'logo_data must be a base64 data URI' });
    }
    set(orgId, 'logo_data', logo_data);
    if (logo_data) {
      regenerateWordmarks(logo_data).then(ok => {
        if (ok) console.log('[branding] Pangolin login page updated automatically');
      });
    }
  }

  // Email branding fields
  if (email_sender_name !== undefined) {
    set(orgId, 'email_sender_name', email_sender_name);
    updatePangolinEmailSender(email_sender_name);
  }
  if (email_use_logo !== undefined) set(orgId, 'email_use_logo', email_use_logo ? '1' : '0');
  if (email_logo_url !== undefined && email_logo_url.trim()) {
    set(orgId, 'email_logo_url', email_logo_url.trim());
    updatePangolinEmailLogo(email_logo_url.trim());
  }

  // Optionally push org_name to Pangolin API
  const apiUrl = process.env.PANGOLIN_API_URL;
  const apiKey = process.env.PANGOLIN_API_KEY;
  if (apiUrl && apiKey && org_name) {
    fetch(`${apiUrl}/org/${orgId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: org_name }),
    }).catch(err => console.warn('[branding] Pangolin API update failed:', err.message));
  }

  res.json({ ok: true, config: getAll(orgId) });
});

// DELETE logo
router.delete('/logo', (req, res) => {
  set(req.activeOrg, 'logo_data', '');
  res.json({ ok: true });
});

module.exports = router;
