const express = require('express');
const db = require('../db');
const { sign } = require('../auth');
const pw = require('../passwords');
const mailer = require('../mailer');
const detection = require('../detection');
const { makeLimiter } = require('../rateLimit');
const { requireAuth } = require('../auth');
const twofa = require('../twofa');
const sms = require('../sms');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

// Génère un code SMS, le stocke (haché, valable 5 min) et l'envoie au téléphone du compte.
async function issueSmsCode(user) {
  const code = twofa.generateSmsCode();
  const hash = twofa.hashSmsCode(code);
  await db.query(
    "UPDATE users SET sms_code=$1, sms_code_expires=NOW() + INTERVAL '5 minutes' WHERE id=$2",
    [hash, user.id]);
  await sms.sendSMS({ to: user.phone, body: `CyberEvents : votre code de connexion est ${code} (valable 5 min).` });
}

// Vérifie un code SMS : bon hash ET non expiré.
async function verifySmsCode(userId, code) {
  const { rows } = await db.query(
    'SELECT sms_code, sms_code_expires FROM users WHERE id=$1', [userId]);
  const u = rows[0];
  if (!u || !u.sms_code || !u.sms_code_expires) return false;
  if (new Date(u.sms_code_expires) < new Date()) return false;
  if (twofa.hashSmsCode(code) !== u.sms_code) return false;
  // code à usage unique : on l'efface après succès
  await db.query('UPDATE users SET sms_code=NULL, sms_code_expires=NULL WHERE id=$1', [userId]);
  return true;
}

// Masque un numéro pour l'affichage : +336XXXXXX89
function maskPhone(p) {
  if (!p || p.length < 4) return 'votre téléphone';
  return p.slice(0, 3) + 'XXXXXX' + p.slice(-2);
}

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

    // 2FA : si activé, on ne délivre pas encore le jeton ; on demande le code.
    // Priorité au SMS s'il est activé, sinon l'application (TOTP).
    if (user.sms_enabled && user.phone) {
      await issueSmsCode(user);
      const challenge = jwt.sign({ uid: user.id, step: '2fa', method: 'sms' }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ need2fa: true, method: 'sms', hint: maskPhone(user.phone), challenge });
    }
    if (user.totp_enabled) {
      const challenge = jwt.sign({ uid: user.id, step: '2fa', method: 'app' }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ need2fa: true, method: 'app', challenge });
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
    if (!user) return res.status(401).json({ error: 'Code incorrect.' });

    // Vérification selon la méthode choisie à la connexion
    const method = payload.method || 'app';
    const ok = method === 'sms'
      ? await verifySmsCode(user.id, code)
      : twofa.verifyCode(user.totp_secret, code);
    if (!ok) return res.status(401).json({ error: 'Code incorrect.' });

    res.json({ token: sign(user),
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (e) { next(e); }
});

// État du 2FA pour l'utilisateur connecté (application + SMS)
router.get('/2fa/status', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT totp_enabled, sms_enabled, phone FROM users WHERE id=$1', [req.user.id]);
    const u = rows[0] || {};
    res.json({
      enabled: !!u.totp_enabled,           // 2FA par application (compat. écran existant)
      smsEnabled: !!u.sms_enabled,         // 2FA par SMS
      phone: u.phone || '',
    });
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

// Désactiver le 2FA (application)
router.post('/2fa/disable', requireAuth, async (req, res, next) => {
  try {
    await db.query('UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [req.user.id]);
    res.json({ enabled: false });
  } catch (e) { next(e); }
});

// --- 2FA par SMS ---

// Démarrer : enregistre le téléphone et envoie un premier code de vérification
router.post('/2fa/sms/setup', requireAuth, async (req, res, next) => {
  try {
    const phone = (req.body && req.body.phone || '').trim();
    // Format international attendu, ex : +33612345678
    if (!/^\+?\d{8,15}$/.test(phone))
      return res.status(400).json({ error: 'Numéro invalide. Format attendu : +33612345678' });
    await db.query('UPDATE users SET phone=$1, sms_enabled=false WHERE id=$2', [phone, req.user.id]);
    await issueSmsCode({ id: req.user.id, phone });
    res.json({ sent: true, hint: maskPhone(phone) });
  } catch (e) { next(e); }
});

// Activer le 2FA par SMS après vérification du code reçu
router.post('/2fa/sms/enable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const ok = await verifySmsCode(req.user.id, code);
    if (!ok) return res.status(401).json({ error: 'Code incorrect ou expiré, réessayez.' });
    await db.query('UPDATE users SET sms_enabled=true WHERE id=$1', [req.user.id]);
    res.json({ smsEnabled: true });
  } catch (e) { next(e); }
});

// Désactiver le 2FA par SMS
router.post('/2fa/sms/disable', requireAuth, async (req, res, next) => {
  try {
    await db.query(
      'UPDATE users SET sms_enabled=false, sms_code=NULL, sms_code_expires=NULL WHERE id=$1',
      [req.user.id]);
    res.json({ smsEnabled: false });
  } catch (e) { next(e); }
});

// ===== Bonus : mot de passe oublié (réinitialisation par e-mail) =====
const crypto = require('crypto');
const WEB_URL = process.env.WEB_URL || 'https://cyberevents-web.onrender.com';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const forgotLimiter = makeLimiter({ windowMs: 60000, max: 5, message: 'Trop de demandes. Réessayez dans une minute.' });

// 1) Demande de réinitialisation : envoie un lien par e-mail (réponse générique).
router.post('/forgot', forgotLimiter, async (req, res, next) => {
  try {
    const email = ((req.body && req.body.email) || '').trim();
    const generic = { message: "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé." };
    if (!email) return res.json(generic);
    const { rows } = await db.query('SELECT id, full_name FROM users WHERE email=$1', [email]);
    const user = rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.query(
        "UPDATE users SET reset_token=$1, reset_token_expires=NOW() + INTERVAL '30 minutes' WHERE id=$2",
        [sha256(token), user.id]);
      const link = `${WEB_URL}/reinitialiser?token=${token}`;
      await mailer.sendMail({
        to: email,
        subject: 'CyberEvents — réinitialisation de votre mot de passe',
        text: `Bonjour ${user.full_name || ''},\n\n` +
          `Vous avez demandé à réinitialiser votre mot de passe.\n` +
          `Ouvrez ce lien (valable 30 minutes) pour en choisir un nouveau :\n${link}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
        html: `<p>Bonjour ${user.full_name || ''},</p>` +
          `<p>Vous avez demandé à réinitialiser votre mot de passe CyberEvents.</p>` +
          `<p><a href="${link}">Choisir un nouveau mot de passe</a> (lien valable 30 minutes).</p>` +
          `<p style="color:#888">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
      });
    }
    res.json(generic);
  } catch (e) { next(e); }
});

// 2) Réinitialisation effective avec le jeton reçu par e-mail.
router.post('/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Jeton et nouveau mot de passe requis.' });
    const policy = pw.policyError(password);
    if (policy) return res.status(400).json({ error: policy });
    const { rows } = await db.query(
      'SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()', [sha256(token)]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Lien invalide ou expiré. Refaites une demande.' });
    const hashed = await pw.store(password);
    await db.query(
      'UPDATE users SET password=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2',
      [hashed, user.id]);
    res.json({ message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
  } catch (e) { next(e); }
});

module.exports = router;
