const express = require('express');
const db = require('../db');
const { sign } = require('../auth');
const pw = require('../passwords');
const mailer = require('../mailer');

const router = express.Router();

// US-002 : création de compte
router.post('/register', async (req, res, next) => {
  try {
    const { email, full_name, password, country } = req.body || {};
    if (!email || !full_name || !password)
      return res.status(400).json({ error: 'E-mail, nom et mot de passe sont requis.' });

    const policy = pw.policyError(password);
    if (policy) return res.status(400).json({ error: policy });

    const exists = await db.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (exists.rowCount) return res.status(409).json({ error: 'Cet e-mail est déjà utilisé.' });

    const stored = await pw.store(password);
    const { rows } = await db.query(
      `INSERT INTO users (email, full_name, password, role, country, consent_at)
       VALUES ($1,$2,$3,'client',$4,NOW())
       RETURNING id, email, full_name, role`,
      [email, full_name, stored, country || 'FR']
    );
    mailer.send(email, 'Bienvenue sur CyberEvents', `Bonjour ${full_name}, votre compte est créé.`);
    res.status(201).json({ token: sign(rows[0]), user: rows[0] });
  } catch (e) { next(e); }
});

// US-002 : connexion
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = rows[0];
    const ok = user && await pw.verify(password, user.password);

    // Tentative tracée pour la détection de brute force (T37 / US-018)
    await db.query(
      `INSERT INTO security_alerts (type, severity, ip, details)
       SELECT 'login_attempt','low',$1,$2
       WHERE NOT $3`,
      [req.ip, { email, success: !!ok }, !!ok]
    ).catch(() => {});

    if (!ok) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
    res.json({ token: sign(user),
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (e) { next(e); }
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
  res.json({ user: req.user });
});

module.exports = router;
