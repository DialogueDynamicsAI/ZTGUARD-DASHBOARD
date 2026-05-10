require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const authRoutes = require('./routes/auth');
const destinationRoutes = require('./routes/destinations');
const historyRoutes = require('./routes/history');
const brandingRoutes = require('./routes/branding');
const activityRoutes = require('./routes/activity');
const orgsRoutes = require('./routes/orgs');
const alertingRoutes = require('./routes/alerting');
const { startPoller } = require('./poller');
const { startAlerter } = require('./alerter');

const app = express();
const PORT = process.env.PORT || 3100;
const BASE = process.env.BASE_PATH || '/ztguard';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DEFAULT_ORG = process.env.PANGOLIN_ORG_ID || 'default';

// ── Hash admin password on startup ──────────────────────────────────────────
(async () => {
  const plain = process.env.ADMIN_PASSWORD;
  if (plain && !process.env.ADMIN_PASSWORD_HASH) {
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(plain, 12);
    console.log('[auth] Admin password hashed from ADMIN_PASSWORD env var');
  } else if (!process.env.ADMIN_PASSWORD_HASH) {
    const fallback = 'ztguard-admin-2026';
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(fallback, 12);
    console.warn('[auth] WARNING: No ADMIN_PASSWORD set. Using default: ztguard-admin-2026');
  }
})();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ dir: DATA_DIR, db: 'sessions.db', table: 'sessions' }),
  secret: process.env.SESSION_SECRET || 'ztguard-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// ── Auth guard middleware ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect(BASE + '/login');
}

// ── Inject active org into every authenticated request ──────────────────────
function injectActiveOrg(req, res, next) {
  req.activeOrg = req.session.activeOrg || DEFAULT_ORG;
  next();
}

// ── Static files (public/) served under BASE ────────────────────────────────
app.use(BASE + '/static', express.static(path.join(__dirname, '..', 'public')));

// ── Auth routes (no guard) ───────────────────────────────────────────────────
app.use(BASE, authRoutes);

// ── Public: logo image scoped to active org ──────────────────────────────────
app.get(BASE + '/api/branding/logo', (req, res) => {
  // Support ?org_id= param for cross-org preview (no auth needed, it's just an image)
  const orgId = req.query.org_id || req.session?.activeOrg || DEFAULT_ORG;
  const logoData = db.prepare(
    `SELECT value FROM branding_config WHERE org_id = ? AND key = 'logo_data'`
  ).get(orgId);
  if (!logoData || !logoData.value) return res.status(404).send('No logo set');
  const raw = logoData.value;
  const [header, data] = raw.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  res.set('Content-Type', mime);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(Buffer.from(data, 'base64'));
});

// ── Protected API routes ──────────────────────────────────────────────────────
app.use(BASE + '/api/orgs',         requireAuth, injectActiveOrg, orgsRoutes);
app.use(BASE + '/api/alerting',     requireAuth, injectActiveOrg, alertingRoutes);
app.use(BASE + '/api/destinations', requireAuth, injectActiveOrg, destinationRoutes);
app.use(BASE + '/api/history',      requireAuth, injectActiveOrg, historyRoutes);
app.use(BASE + '/api/activity',     requireAuth, injectActiveOrg, activityRoutes);
app.use(BASE + '/api/branding',     requireAuth, injectActiveOrg, brandingRoutes);

// ── API: status ───────────────────────────────────────────────────────────────
app.get(BASE + '/api/status', requireAuth, injectActiveOrg, (req, res) => {
  const orgId = req.activeOrg;
  const cursors = db.prepare('SELECT * FROM cursors WHERE org_id = ?').all(orgId);
  const destCount = db.prepare('SELECT COUNT(*) as n FROM destinations WHERE active = 1 AND org_id = ?').get(orgId);
  const recentDelivery = db.prepare(
    'SELECT created_at, status_code FROM delivery_log WHERE org_id = ? ORDER BY id DESC LIMIT 1'
  ).get(orgId);
  res.json({
    ok: true,
    activeOrg: orgId,
    activeDestinations: destCount.n,
    cursors,
    lastDelivery: recentDelivery || null,
    pollInterval: parseInt(process.env.POLL_INTERVAL_SECONDS || '30'),
  });
});

// ── Serve app shell for all other protected pages ────────────────────────────
app.get(BASE + '/', requireAuth, (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, '..', 'public') });
});

app.get(BASE, requireAuth, (req, res) => {
  res.redirect(BASE + '/');
});

// Catch-all: send app shell for SPA navigation
app.get(BASE + '/*', requireAuth, (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, '..', 'public') });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] ZTGuard Portal running on port ${PORT}`);
  console.log(`[server] Base path: ${BASE}, Default org: ${DEFAULT_ORG}`);
  startPoller();
  startAlerter();
});
