const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'state.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS destinations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    url         TEXT    NOT NULL,
    auth_type   TEXT    NOT NULL DEFAULT 'none',
    auth_value  TEXT,
    log_types   TEXT    NOT NULL DEFAULT '["request"]',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cursors (
    log_type    TEXT PRIMARY KEY,
    last_ts     INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS delivery_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    destination_id  INTEGER REFERENCES destinations(id) ON DELETE CASCADE,
    destination_name TEXT,
    log_type        TEXT,
    event_ts        TEXT,
    status_code     INTEGER,
    latency_ms      INTEGER,
    error           TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS branding_config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default cursor rows for each log type
const LOG_TYPES = ['request', 'action', 'access', 'connection'];
const insertCursor = db.prepare(
  `INSERT OR IGNORE INTO cursors (log_type, last_ts) VALUES (?, 0)`
);
for (const t of LOG_TYPES) insertCursor.run(t);

// Default branding values
const insertBranding = db.prepare(
  `INSERT OR IGNORE INTO branding_config (key, value) VALUES (?, ?)`
);
insertBranding.run('org_name', 'ZTGuard');
insertBranding.run('primary_color', '#2563eb');
insertBranding.run('logo_data', '');
insertBranding.run('login_url', '');
insertBranding.run('auth_title', 'Authenticate to access {{resourceName}}');
insertBranding.run('auth_subtitle', 'Choose your preferred authentication method for {{resourceName}}');
insertBranding.run('custom_css', '');
insertBranding.run('custom_header_html', '');
insertBranding.run('custom_footer_html', '');

module.exports = db;
