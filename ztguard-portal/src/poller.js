const fetch = require('node-fetch');
const db = require('./db');
const { forwardEvents } = require('./forwarder');

const LOG_TYPES = ['request', 'action', 'access', 'connection'];

const getCursor = db.prepare(`SELECT last_ts FROM cursors WHERE log_type = ?`);
const setCursor = db.prepare(
  `UPDATE cursors SET last_ts = ?, updated_at = datetime('now') WHERE log_type = ?`
);

async function pollLogType(logType) {
  const apiUrl = process.env.PANGOLIN_API_URL;
  const apiKey = process.env.PANGOLIN_API_KEY;
  const orgId = process.env.PANGOLIN_ORG_ID;

  if (!apiUrl || !apiKey || !orgId) {
    console.warn('[poller] Missing PANGOLIN_API_URL, PANGOLIN_API_KEY, or PANGOLIN_ORG_ID — skipping poll');
    return;
  }

  const cursor = getCursor.get(logType);
  const since = cursor ? cursor.last_ts : 0;

  const url = `${apiUrl}/org/${orgId}/logs/${logType}?limit=200&start=${since}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });

    if (resp.status === 401) {
      console.error('[poller] Pangolin API key rejected (401). Check PANGOLIN_API_KEY.');
      return;
    }
    if (resp.status === 403) {
      console.warn(`[poller] Log type "${logType}" not available in this Pangolin edition (403). Skipping.`);
      return;
    }
    if (!resp.ok) {
      console.error(`[poller] ${logType} → HTTP ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const items = data.data?.items || data.items || [];

    if (items.length === 0) return;

    // Update cursor to latest timestamp in this batch
    const latest = Math.max(...items.map(i => i.timestamp || 0));
    if (latest > since) {
      setCursor.run(latest + 1, logType);
    }

    console.log(`[poller] ${logType} → ${items.length} new events`);
    await forwardEvents(logType, items);
  } catch (err) {
    console.error(`[poller] ${logType} → fetch error: ${err.message}`);
  }
}

async function pollAll() {
  for (const logType of LOG_TYPES) {
    await pollLogType(logType);
  }
}

function startPoller() {
  const intervalSec = parseInt(process.env.POLL_INTERVAL_SECONDS || '30', 10);
  console.log(`[poller] Starting — polling every ${intervalSec}s`);

  // Initial poll after 5s startup delay
  setTimeout(() => pollAll(), 5000);

  // Recurring poll
  setInterval(() => pollAll(), intervalSec * 1000);
}

module.exports = { startPoller, pollAll };
