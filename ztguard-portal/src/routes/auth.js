const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const BASE = process.env.BASE_PATH || '/ztguard';

router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect(BASE + '/');
  }
  res.sendFile('login.html', { root: require('path').join(__dirname, '../../public') });
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!password || !hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.authenticated = true;
  req.session.save(() => {
    res.json({ ok: true, redirect: BASE + '/' });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, redirect: BASE + '/login' });
  });
});

module.exports = router;
