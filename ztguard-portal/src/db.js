const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_ORG = process.env.PANGOLIN_ORG_ID || 'default';

const db = new Database(path.join(DATA_DIR, 'state.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS destinations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id      TEXT    NOT NULL DEFAULT 'default',
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
    org_id      TEXT    NOT NULL DEFAULT 'default',
    log_type    TEXT    NOT NULL,
    last_ts     INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (org_id, log_type)
  );

  CREATE TABLE IF NOT EXISTS delivery_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id          TEXT,
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
    org_id TEXT NOT NULL DEFAULT 'default',
    key    TEXT NOT NULL,
    value  TEXT,
    PRIMARY KEY (org_id, key)
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ── Safe migrations for existing installs ──────────────────────────────────
// Add org_id to tables that may have been created without it
const migrations = [
  `ALTER TABLE destinations  ADD COLUMN org_id TEXT NOT NULL DEFAULT 'default'`,
  `ALTER TABLE delivery_log  ADD COLUMN org_id TEXT`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

// Migrate old branding_config (key PRIMARY KEY) → new (org_id, key PRIMARY KEY)
// Detect old schema by checking if org_id column exists
const brandingCols = db.pragma('table_info(branding_config)').map(c => c.name);
if (!brandingCols.includes('org_id')) {
  // Old single-column schema — migrate data
  db.exec(`
    CREATE TABLE IF NOT EXISTS branding_config_new (
      org_id TEXT NOT NULL DEFAULT 'default',
      key    TEXT NOT NULL,
      value  TEXT,
      PRIMARY KEY (org_id, key)
    );
    INSERT OR IGNORE INTO branding_config_new (org_id, key, value)
      SELECT '${DEFAULT_ORG}', key, value FROM branding_config;
    DROP TABLE branding_config;
    ALTER TABLE branding_config_new RENAME TO branding_config;
  `);
  console.log('[db] Migrated branding_config to multi-org schema');
}

// Migrate old cursors (log_type PRIMARY KEY) → new (org_id, log_type PRIMARY KEY)
const cursorCols = db.pragma('table_info(cursors)').map(c => c.name);
if (!cursorCols.includes('org_id')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursors_new (
      org_id      TEXT    NOT NULL DEFAULT 'default',
      log_type    TEXT    NOT NULL,
      last_ts     INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (org_id, log_type)
    );
    INSERT OR IGNORE INTO cursors_new (org_id, log_type, last_ts, updated_at)
      SELECT '${DEFAULT_ORG}', log_type, last_ts, updated_at FROM cursors;
    DROP TABLE cursors;
    ALTER TABLE cursors_new RENAME TO cursors;
  `);
  console.log('[db] Migrated cursors to multi-org schema');
}

// Seed default cursor rows for each log type (for the default org)
const LOG_TYPES = ['request', 'action', 'access', 'connection'];
const insertCursor = db.prepare(
  `INSERT OR IGNORE INTO cursors (org_id, log_type, last_ts) VALUES (?, ?, 0)`
);
for (const t of LOG_TYPES) insertCursor.run(DEFAULT_ORG, t);

// Seed default branding values for the default org
const BRANDING_DEFAULTS = [
  ['org_name', 'ZTGuard'],
  ['primary_color', '#2563eb'],
  ['logo_data', ''],
  ['login_url', ''],
  ['auth_title', 'Authenticate to access {{resourceName}}'],
  ['auth_subtitle', 'Choose your preferred authentication method for {{resourceName}}'],
  ['custom_css', ''],
  ['custom_header_html', ''],
  ['custom_footer_html', ''],
  ['login_theme', 'dark'],
  ['hide_attribution', '1'],
];
const insertBranding = db.prepare(
  `INSERT OR IGNORE INTO branding_config (org_id, key, value) VALUES (?, ?, ?)`
);
for (const [key, value] of BRANDING_DEFAULTS) {
  insertBranding.run(DEFAULT_ORG, key, value);
}

module.exports = db;
