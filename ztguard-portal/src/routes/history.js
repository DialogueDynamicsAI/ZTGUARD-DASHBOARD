const express = require('express');
const db = require('../db');
const router = express.Router();

// GET delivery history with optional filters
router.get('/', (req, res) => {
  const { destination_id, log_type, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM delivery_log WHERE 1=1';
  const params = [];

  if (destination_id) {
    query += ' AND destination_id = ?';
    params.push(destination_id);
  }
  if (log_type) {
    query += ' AND log_type = ?';
    params.push(log_type);
  }

  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(Math.min(parseInt(limit), 500), parseInt(offset));

  const rows = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as n FROM delivery_log').get();

  res.json({ items: rows, total: total.n });
});

// GET summary stats
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status_code = 0 OR status_code >= 400 THEN 1 ELSE 0 END) as failed,
      AVG(latency_ms) as avg_latency_ms
    FROM delivery_log
  `).get();

  const byType = db.prepare(`
    SELECT log_type, COUNT(*) as count
    FROM delivery_log
    GROUP BY log_type
  `).all();

  res.json({ ...stats, by_log_type: byType });
});

// DELETE clear history
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM delivery_log').run();
  res.json({ ok: true });
});

module.exports = router;
