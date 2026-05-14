const fetch = require('node-fetch');
const db = require('./db');
const { forwardEvents } = require('./forwarder');

// Pangolin integration API only exposes 'request' logs via API key auth.
// connection/access/action logs are read directly from Pangolin's SQLite DB (activity.js).
const LOG_TYPES = ['request'];

async function pollLogTypeForOrg(orgId, logType, apiUrl, apiKey) {
  const cursor = db.prepare(
    `SELECT last_ts FROM cursors WHERE org_id = ? AND log_type = ?`
  ).get(orgId, logType);
  const since = cursor ? cursor.last_ts : 0;

  const url = `${apiUrl}/org/${orgId}/logs/${logType}?limit=200&start=${since}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });

    if (resp.status === 401) {
      console.error(`[poller:${orgId}] API key rejected (401). Check PANGOLIN_API_KEY.`);
      return;
    }
    if (resp.status === 403) {
      console.warn(`[poller:${orgId}] Log type "${logType}" not available in this edition (403). Skipping.`);
      return;
    }
    if (!resp.ok) {
      console.error(`[poller:${orgId}] ${logType} → HTTP ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const items = data.data?.items || data.items || [];
    if (items.length === 0) return;

    const latest = Math.max(...items.map(i => i.timestamp || 0));
    if (latest > since) {
      db.prepare(
        `UPDATE cursors SET last_ts = ?, updated_at = datetime('now') WHERE org_id = ? AND log_type = ?`
      ).run(latest + 1, orgId, logType);
    }

    console.log(`[poller:${orgId}] ${logType} → ${items.length} new events`);
    await forwardEvents(orgId, logType, items);
  } catch (err) {
    console.error(`[poller:${orgId}] ${logType} → fetch error: ${err.message}`);
  }
}

async function pollAll() {
  const apiUrl = process.env.PANGOLIN_API_URL;
  const apiKey = process.env.PANGOLIN_API_KEY;

  if (!apiUrl || !apiKey) {
    console.warn('[poller] Missing PANGOLIN_API_URL or PANGOLIN_API_KEY — skipping poll');
    return;
  }

  // Get all distinct orgs that have at least one active destination
  const orgsWithDests = db.prepare(
    `SELECT DISTINCT org_id FROM destinations WHERE active = 1`
  ).all().map(r => r.org_id);

  // Only poll orgs that have active event streaming destinations configured
  if (orgsWithDests.length === 0) {
    // No destinations configured — nothing to forward, skip polling
    return;
  }

  for (const orgId of orgsWithDests) {
    for (const logType of LOG_TYPES) {
      await pollLogTypeForOrg(orgId, logType, apiUrl, apiKey);
    }
  }
}

function startPoller() {
  const intervalSec = parseInt(process.env.POLL_INTERVAL_SECONDS || '30', 10);
  console.log(`[poller] Starting — polling every ${intervalSec}s`);
  setTimeout(() => pollAll(), 5000);
  setInterval(() => pollAll(), intervalSec * 1000);
}

module.exports = { startPoller, pollAll };
