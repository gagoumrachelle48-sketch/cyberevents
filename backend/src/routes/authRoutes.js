const express = require('express');
const db = require('../db');
const { sign } = require('../auth');
const pw = require('../passwords');
const mailer = require('../mailer');
const detection = require('../detection');
const { makeLimiter } = require('../rateLimit');
const { requireAuth } = require('../auth');
const twofa = require('../twofa');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

// T30 : max 5 connexions / minute / IP en mode secure
const loginLimiter = makeLimiter({ windowMs: 60000, max: 5, message: 'Trop de tentatives de connexion.' });

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
router.post('/login', loginLimiter, async (req, res, next) => {
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

    if (!ok) {
      detection.recordLoginFailure(req.ip, email);   // T37/US-018
      return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
    }

    // 2FA : si activé, on ne délivre pas encore le jeton ; on demande le code
    if (user.totp_enabled) {
      const challenge = jwt.sign({ uid: user.id, step: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ need2fa: true, challenge });
    }

    res.json({ token: sign(user),
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (e) { next(e); }
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
  res.json({ user: req.user });
});

// --- 2FA (TOTP) ---

// Étape finale de connexion : vérifier le code 2FA
router.post('/2fa/verify', async (req, res, next) => {
  try {
    const { challenge, code } = req.body || {};
    let payload;
    try { payload = jwt.verify(challenge, JWT_SECRET); } catch { return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' }); }
    if (!payload || payload.step !== '2fa') return res.status(400).json({ error: 'Requête invalide.' });

    const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [payload.uid]);
    const user = rows[0];
    if (!user || !twofa.verifyCode(user.totp_secret, code))
      return res.status(401).json({ error: 'Code incorrect.' });

    res.json({ token: sign(user),
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (e) { next(e); }
});

// État du 2FA pour l'utilisateur connecté
router.get('/2fa/status', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT totp_enabled FROM users WHERE id=$1', [req.user.id]);
    res.json({ enabled: !!(rows[0] && rows[0].totp_enabled) });
  } catch (e) { next(e); }
});

// Démarrer la configuration : génère le secret + le QR à scanner
router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const setup = await twofa.generateSetup(req.user.email);
    // on stocke le secret (pas encore activé)
    await db.query('UPDATE users SET totp_secret=$1, totp_enabled=false WHERE id=$2', [setup.secret, req.user.id]);
    res.json({ qr: setup.qr, otpauth: setup.otpauth });
  } catch (e) { next(e); }
});

// Activer le 2FA après avoir vérifié un premier code
router.post('/2fa/enable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const { rows } = await db.query('SELECT totp_secret FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0] || !rows[0].totp_secret) return res.status(400).json({ error: 'Configuration non démarrée.' });
    if (!twofa.verifyCode(rows[0].totp_secret, code)) return res.status(401).json({ error: 'Code incorrect, réessayez.' });
    await db.query('UPDATE users SET totp_enabled=true WHERE id=$1', [req.user.id]);
    res.json({ enabled: true });
  } catch (e) { next(e); }
});

// Désactiver le 2FA
router.post('/2fa/disable', requireAuth, async (req, res, next) => {
  try {
    await db.query('UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [req.user.id]);
    res.json({ enabled: false });
  } catch (e) { next(e); }
});

module.exports = router;
