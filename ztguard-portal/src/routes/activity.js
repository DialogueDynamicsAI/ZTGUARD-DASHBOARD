const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const router = express.Router();

const PANGOLIN_DB = process.env.PANGOLIN_DB_PATH || '/app/pangolin-db/db.sqlite';

function getPangolinDb() {
  if (!fs.existsSync(PANGOLIN_DB)) {
    throw new Error('Pangolin database not found at ' + PANGOLIN_DB);
  }
  const Database = require('better-sqlite3');
  return new Database(PANGOLIN_DB, { readonly: true });
}

// GET /api/activity/stats — user count, session count, access summary
router.get('/stats', (req, res) => {
  try {
    const db = getPangolinDb();
    const orgId = req.activeOrg;

    const totalUsers = db.prepare(`
      SELECT COUNT(DISTINCT actor) as count
      FROM requestAuditLog
      WHERE actorType = 'user' AND actor IS NOT NULL AND actor != ''
        AND (orgId = ? OR ? = 'default')
    `).get(orgId, orgId);

    const todayStart = Math.floor(Date.now() / 1000) - 86400;
    const todayAccess = db.prepare(`
      SELECT COUNT(*) as count FROM requestAuditLog
      WHERE timestamp > ? AND actorType = 'user'
        AND (orgId = ? OR ? = 'default')
    `).get(todayStart, orgId, orgId);

    const deniedToday = db.prepare(`
      SELECT COUNT(*) as count FROM requestAuditLog
      WHERE timestamp > ? AND action = 0
        AND (orgId = ? OR ? = 'default')
    `).get(todayStart, orgId, orgId);

    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count FROM resourceSessions
      WHERE expiresAt > ?
    `).get(Date.now());

    const lastAccess = db.prepare(`
      SELECT datetime(MAX(timestamp), 'unixepoch') as last
      FROM requestAuditLog WHERE actorType = 'user'
    `).get();

    db.close();

    res.json({
      totalAuthenticatedUsers: totalUsers.count,
      todayAccessEvents: todayAccess.count,
      todayDenied: deniedToday.count,
      activeSessions: activeSessions.count,
      lastAccessTime: lastAccess.last,
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/activity/users — unique users with stats
router.get('/users', (req, res) => {
  try {
    const db = getPangolinDb();
    const { limit = 100, offset = 0 } = req.query;
    const orgId = req.activeOrg;

    const users = db.prepare(`
      SELECT
        actor as email,
        COUNT(*) as totalRequests,
        SUM(CASE WHEN action = 1 THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN action = 0 THEN 1 ELSE 0 END) as denied,
        MAX(timestamp) as lastSeenTs,
        MIN(timestamp) as firstSeenTs,
        GROUP_CONCAT(DISTINCT ip) as ips
      FROM requestAuditLog
      WHERE actorType = 'user' AND actor IS NOT NULL AND actor != ''
        AND (orgId = ? OR ? = 'default')
      GROUP BY actor
      ORDER BY lastSeenTs DESC
      LIMIT ? OFFSET ?
    `).all(orgId, orgId, parseInt(limit), parseInt(offset));

    const total = db.prepare(`
      SELECT COUNT(DISTINCT actor) as count
      FROM requestAuditLog WHERE actorType = 'user' AND actor != ''
        AND (orgId = ? OR ? = 'default')
    `).get(orgId, orgId);

    db.close();

    res.json({
      users: users.map(u => ({
        ...u,
        lastSeen: new Date(u.lastSeenTs * 1000).toISOString(),
        firstSeen: new Date(u.firstSeenTs * 1000).toISOString(),
        ips: u.ips ? u.ips.split(',').filter((v, i, a) => a.indexOf(v) === i).slice(0, 5) : [],
      })),
      total: total.count,
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/activity/log — recent access events
router.get('/log', (req, res) => {
  try {
    const db = getPangolinDb();
    const { limit = 200, offset = 0, user, action } = req.query;
    const orgId = req.activeOrg;

    let query = `
      SELECT timestamp, action, actorType, actor, actorId, ip, path, resourceId
      FROM requestAuditLog WHERE (orgId = ? OR ? = 'default')
    `;
    const params = [orgId, orgId];

    if (user) { query += ' AND actor = ?'; params.push(user); }
    if (action !== undefined) { query += ' AND action = ?'; params.push(parseInt(action)); }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const rows = db.prepare(query).all(...params);
    const totalRow = db.prepare(
      'SELECT COUNT(*) as n FROM requestAuditLog WHERE (orgId = ? OR ? = \'default\')'
    ).get(orgId, orgId);
    db.close();

    res.json({
      items: rows.map(r => ({
        ...r,
        time: new Date(r.timestamp * 1000).toISOString(),
        allowed: r.action === 1,
      })),
      total: totalRow.n,
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/activity/access-log — PIN/OTP auth events (accessAuditLog)
router.get('/access-log', (req, res) => {
  try {
    const db = getPangolinDb();
    const rows = db.prepare(`
      SELECT timestamp, actorType, actor, ip, location, type, action, userAgent, metadata
      FROM accessAuditLog
      ORDER BY timestamp DESC LIMIT 200
    `).all();
    db.close();

    res.json({
      items: rows.map(r => ({
        ...r,
        time: new Date(r.timestamp * 1000).toISOString(),
        allowed: r.action === 1,
      })),
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/activity/block — block a user via Pangolin API
router.post('/block', async (req, res) => {
  const { userId, orgId, reason } = req.body;
  const apiUrl = process.env.PANGOLIN_API_URL;
  const apiKey = process.env.PANGOLIN_API_KEY;
  const orgIdEnv = orgId || process.env.PANGOLIN_ORG_ID;

  if (!apiUrl || !apiKey) {
    return res.status(503).json({ error: 'Pangolin API not configured. Set PANGOLIN_API_KEY in .env' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    // Delete user from org (revoke all access)
    const resp = await fetch(`${apiUrl}/org/${orgIdEnv}/user/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({ error: `Pangolin API error: ${body}` });
    }
    res.json({ ok: true, message: `User ${userId} removed from org` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activity/network — connection/network logs
router.get('/network', (req, res) => {
  try {
    const db = getPangolinDb();
    const { limit = 500, offset = 0 } = req.query;
    const orgId = req.activeOrg;

    const rows = db.prepare(`
      SELECT id, sessionId, protocol, siteResourceId, clientId, userId,
             sourceAddr, destAddr, startedAt, endedAt, bytesTx, bytesRx, orgId
      FROM connectionAuditLog
      WHERE (orgId = ? OR ? = 'default')
      ORDER BY startedAt DESC LIMIT ? OFFSET ?
    `).all(orgId, orgId, parseInt(limit), parseInt(offset));

    const total = db.prepare(
      'SELECT COUNT(*) as n FROM connectionAuditLog WHERE (orgId = ? OR ? = \'default\')'
    ).get(orgId, orgId);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as totalSessions,
        SUM(bytesTx) as totalBytesTx,
        SUM(bytesRx) as totalBytesRx,
        COUNT(DISTINCT userId) as uniqueUsers
      FROM connectionAuditLog
      WHERE (orgId = ? OR ? = 'default')
    `).get(orgId, orgId);

    db.close();

    res.json({
      items: rows.map(r => ({
        ...r,
        time: r.startedAt ? new Date(r.startedAt * 1000).toISOString() : null,
        endTime: r.endedAt ? new Date(r.endedAt * 1000).toISOString() : null,
        duration: r.endedAt && r.startedAt ? r.endedAt - r.startedAt : null,
        bytesTotal: (r.bytesTx || 0) + (r.bytesRx || 0),
      })),
      total: total.n,
      stats,
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/activity/chart — time-series data for graphs
router.get('/chart', (req, res) => {
  try {
    const db = getPangolinDb();
    const days = parseInt(req.query.days || '30');
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const orgId = req.activeOrg;
    const orgFilter = `(orgId = '${orgId}' OR '${orgId}' = 'default')`;

    const accessByDay = db.prepare(`
      SELECT
        date(timestamp, 'unixepoch') as day,
        COUNT(*) as total,
        SUM(CASE WHEN action = 1 THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN action = 0 THEN 1 ELSE 0 END) as denied,
        COUNT(DISTINCT CASE WHEN actorType='user' THEN actor END) as uniqueUsers,
        COUNT(DISTINCT ip) as uniqueIps
      FROM requestAuditLog
      WHERE timestamp > ? AND ${orgFilter}
      GROUP BY day ORDER BY day ASC
    `).all(since);

    const topUsers = db.prepare(`
      SELECT actor as email, COUNT(*) as requests,
        MAX(timestamp) as lastSeen
      FROM requestAuditLog
      WHERE actorType = 'user' AND actor != '' AND actor IS NOT NULL
        AND timestamp > ? AND ${orgFilter}
      GROUP BY actor ORDER BY requests DESC LIMIT 10
    `).all(since);

    const topIps = db.prepare(`
      SELECT ip, COUNT(*) as requests,
        SUM(CASE WHEN action = 1 THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN action = 0 THEN 1 ELSE 0 END) as denied,
        COUNT(DISTINCT actor) as users
      FROM requestAuditLog
      WHERE timestamp > ? AND ${orgFilter} AND ip IS NOT NULL
      GROUP BY ip ORDER BY requests DESC LIMIT 10
    `).all(since);

    const topResources = db.prepare(`
      SELECT r.name as resourceName, r.fullDomain as domain,
        COUNT(*) as requests,
        SUM(CASE WHEN l.action = 1 THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN l.action = 0 THEN 1 ELSE 0 END) as denied
      FROM requestAuditLog l
      LEFT JOIN resources r ON l.resourceId = r.resourceId
      WHERE l.timestamp > ? AND (l.orgId = '${orgId}' OR '${orgId}' = 'default')
      GROUP BY l.resourceId ORDER BY requests DESC LIMIT 10
    `).all(since);

    const authBreakdown = db.prepare(`
      SELECT
        CASE
          WHEN actorType = 'user' THEN 'Platform SSO'
          WHEN actorType IS NULL AND actor IS NULL THEN 'Session/Whitelist'
          ELSE actorType
        END as method,
        COUNT(*) as count
      FROM requestAuditLog
      WHERE timestamp > ? AND ${orgFilter}
      GROUP BY method ORDER BY count DESC
    `).all(since);

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 1 THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN action = 0 THEN 1 ELSE 0 END) as denied,
        COUNT(DISTINCT CASE WHEN actorType='user' THEN actor END) as uniqueUsers,
        COUNT(DISTINCT ip) as uniqueIps
      FROM requestAuditLog WHERE timestamp > ? AND ${orgFilter}
    `).get(since);

    // Session activity over time (hourly for last 24h, daily for longer)
    const sessionsByDay = db.prepare(`
      SELECT date(issuedAt/1000, 'unixepoch') as day, COUNT(*) as sessions
      FROM resourceSessions
      WHERE issuedAt > ?
      GROUP BY day ORDER BY day ASC
    `).all(since * 1000);

    db.close();

    res.json({ accessByDay, topUsers, topIps, topResources, authBreakdown, totals, sessionsByDay, days });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET/POST /api/activity/retention — manage Pangolin log retention settings
router.get('/retention', async (req, res) => {
  try {
    const db = getPangolinDb();
    const orgId = req.activeOrg;
    const org = db.prepare(
      'SELECT settingsLogRetentionDaysRequest,settingsLogRetentionDaysAccess,settingsLogRetentionDaysAction,settingsLogRetentionDaysConnection FROM orgs WHERE orgId = ?'
    ).get(orgId) || db.prepare(
      'SELECT settingsLogRetentionDaysRequest,settingsLogRetentionDaysAccess,settingsLogRetentionDaysAction,settingsLogRetentionDaysConnection FROM orgs LIMIT 1'
    ).get();
    db.close();
    res.json({
      request:    org?.settingsLogRetentionDaysRequest    ?? 7,
      access:     org?.settingsLogRetentionDaysAccess     ?? 0,
      action:     org?.settingsLogRetentionDaysAction     ?? 0,
      connection: org?.settingsLogRetentionDaysConnection ?? 0,
    });
  } catch (err) { res.status(503).json({ error: err.message }); }
});

router.post('/retention', async (req, res) => {
  try {
    const { request, access, action, connection } = req.body;
    const orgId = req.activeOrg;

    // Pangolin DB is read-only in ZTGuard container — use Docker socket to exec into Pangolin
    const db = getPangolinDb();
    const org = db.prepare('SELECT orgId FROM orgs WHERE orgId = ? LIMIT 1').get(orgId)
              || db.prepare('SELECT orgId FROM orgs LIMIT 1').get();
    db.close();
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const sets = [];
    if (request    !== undefined) sets.push(`settingsLogRetentionDaysRequest=${parseInt(request)}`);
    if (access     !== undefined) sets.push(`settingsLogRetentionDaysAccess=${parseInt(access)}`);
    if (action     !== undefined) sets.push(`settingsLogRetentionDaysAction=${parseInt(action)}`);
    if (connection !== undefined) sets.push(`settingsLogRetentionDaysConnection=${parseInt(connection)}`);

    if (sets.length === 0) return res.json({ ok: true, message: 'Nothing to update' });

    const script = `node -e "
const db=require('/app/node_modules/better-sqlite3')('/app/config/db/db.sqlite');
db.prepare('UPDATE orgs SET ${sets.join(',')} WHERE orgId=\\"${org.orgId}\\"').run();
const r=db.prepare('SELECT settingsLogRetentionDaysRequest as req,settingsLogRetentionDaysAccess as acc,settingsLogRetentionDaysAction as act,settingsLogRetentionDaysConnection as con FROM orgs WHERE orgId=\\"${org.orgId}\\"').get();
console.log(JSON.stringify(r));
db.close();
"`;

    const http = require('http');
    const result = await new Promise((resolve, reject) => {
      const createBody = JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: ['sh', '-c', script] });
      const cr = http.request({ socketPath: '/var/run/docker.sock', path: '/containers/pangolin/exec', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': createBody.length } }, (res2) => {
        let data = '';
        res2.on('data', d => { data += d; });
        res2.on('end', () => {
          try {
            const { Id } = JSON.parse(data);
            const startBody = JSON.stringify({ Detach: false });
            const sr = http.request({ socketPath: '/var/run/docker.sock', path: `/exec/${Id}/start`, method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': startBody.length } }, (r2) => {
              let out = '';
              r2.on('data', d => { out += d; });
              r2.on('end', () => resolve(out));
            });
            sr.on('error', reject);
            sr.end(startBody);
          } catch (e) { reject(e); }
        });
      });
      cr.on('error', reject);
      cr.end(createBody);
    });

    // Extract JSON from Docker exec output (has binary prefix)
    const jsonMatch = result.match(/\{[^}]+\}/);
    const updated = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    console.log('[activity] Retention updated:', updated);

    res.json({ ok: true, message: `Log retention updated for org ${org.orgId}`, updated });
  } catch (err) { res.status(503).json({ error: err.message }); }
});

// GET /api/activity/sessions — active resource sessions with resource name
router.get('/sessions', (req, res) => {
  try {
    const db = getPangolinDb();
    const now = Date.now();

    const rows = db.prepare(`
      SELECT rs.id, rs.resourceId, rs.expiresAt, rs.issuedAt, rs.isRequestToken,
             rs.sessionLength, rs.doNotExtend, rs.userSessionId,
             r.name as resourceName, r.fullDomain as resourceDomain
      FROM resourceSessions rs
      LEFT JOIN resources r ON rs.resourceId = r.resourceId
      WHERE rs.expiresAt > ?
      ORDER BY rs.issuedAt DESC LIMIT 200
    `).all(now);

    // Also get all sessions count (including expired)
    const allCount = db.prepare('SELECT COUNT(*) as n FROM resourceSessions').get();
    const activeCount = db.prepare('SELECT COUNT(*) as n FROM resourceSessions WHERE expiresAt > ?').get(now);

    db.close();

    res.json({
      sessions: rows.map(r => ({
        ...r,
        issued: r.issuedAt ? new Date(r.issuedAt).toISOString() : null,
        expires: new Date(r.expiresAt).toISOString(),
        expiresInMin: Math.round((r.expiresAt - now) / 60000),
        expiresIn: Math.round((r.expiresAt - now) / 60000) + ' min',
      })),
      activeCount: activeCount.n,
      totalCount: allCount.n,
    });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
