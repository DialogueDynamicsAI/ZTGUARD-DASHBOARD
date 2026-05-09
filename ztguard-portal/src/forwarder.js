const fetch = require('node-fetch');
const db = require('./db');

const insertLog = db.prepare(`
  INSERT INTO delivery_log
    (destination_id, destination_name, log_type, event_ts, status_code, latency_ms, error, retry_count)
  VALUES
    (@destination_id, @destination_name, @log_type, @event_ts, @status_code, @latency_ms, @error, @retry_count)
`);

async function forwardToDestination(destination, logType, events) {
  if (!events || events.length === 0) return;

  const headers = { 'Content-Type': 'application/json' };

  if (destination.auth_type === 'bearer') {
    headers['Authorization'] = `Bearer ${destination.auth_value}`;
  } else if (destination.auth_type === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(destination.auth_value).toString('base64')}`;
  } else if (destination.auth_type === 'custom') {
    try {
      const custom = JSON.parse(destination.auth_value || '{}');
      Object.assign(headers, custom);
    } catch (_) {}
  }

  const payload = events.map(evt => ({
    event: `${logType}_log`,
    timestamp: new Date(evt.timestamp * 1000).toISOString(),
    source: 'ztguard-portal',
    data: evt,
  }));

  const start = Date.now();
  let statusCode = 0;
  let error = null;

  try {
    const resp = await fetch(destination.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: 10000,
    });
    statusCode = resp.status;
  } catch (err) {
    error = err.message;
    statusCode = 0;
  }

  const latency = Date.now() - start;

  insertLog.run({
    destination_id: destination.id,
    destination_name: destination.name,
    log_type: logType,
    event_ts: new Date().toISOString(),
    status_code: statusCode,
    latency_ms: latency,
    error: error || null,
    retry_count: 0,
  });

  if (error) {
    console.error(`[forwarder] ${destination.name} → ERROR: ${error}`);
  } else {
    console.log(`[forwarder] ${destination.name} (${logType}) → HTTP ${statusCode} in ${latency}ms`);
  }
}

async function forwardEvents(logType, events) {
  const destinations = db.prepare(
    `SELECT * FROM destinations WHERE active = 1`
  ).all();

  for (const dest of destinations) {
    let enabledTypes;
    try {
      enabledTypes = JSON.parse(dest.log_types || '[]');
    } catch (_) {
      enabledTypes = [];
    }
    if (!enabledTypes.includes(logType)) continue;
    await forwardToDestination(dest, logType, events);
  }
}

async function sendTestPayload(destination) {
  const sample = [{
    event: 'test_event',
    timestamp: new Date().toISOString(),
    source: 'ztguard-portal',
    data: {
      message: 'This is a test payload from ZTGuard Portal',
      destination: destination.name,
    },
  }];

  const headers = { 'Content-Type': 'application/json' };
  if (destination.auth_type === 'bearer') {
    headers['Authorization'] = `Bearer ${destination.auth_value}`;
  } else if (destination.auth_type === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(destination.auth_value).toString('base64')}`;
  } else if (destination.auth_type === 'custom') {
    try {
      Object.assign(headers, JSON.parse(destination.auth_value || '{}'));
    } catch (_) {}
  }

  const start = Date.now();
  try {
    const resp = await fetch(destination.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(sample),
      timeout: 10000,
    });
    return { ok: resp.ok, status: resp.status, latency: Date.now() - start };
  } catch (err) {
    return { ok: false, status: 0, error: err.message, latency: Date.now() - start };
  }
}

module.exports = { forwardEvents, sendTestPayload };
