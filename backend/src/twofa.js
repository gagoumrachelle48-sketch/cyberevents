// Authentification à deux facteurs (2FA) par TOTP — compatible Google Authenticator,
// Microsoft Authenticator, etc. Aucun service externe requis.
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

authenticator.options = { window: 1 }; // tolère un petit décalage d'horloge

// Génère un secret + l'image QR à scanner dans l'app d'authentification
async function generateSetup(email) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, 'CyberEvents', secret);
  const qr = await QRCode.toDataURL(otpauth, { width: 220, margin: 1 });
  return { secret, otpauth, qr };
}

// Vérifie un code à 6 chiffres contre le secret
function verifyCode(secret, code) {
  if (!secret || !code) return false;
  try { return authenticator.verify({ token: String(code).trim(), secret }); }
  catch { return false; }
}

// --- 2FA par SMS ---
const crypto = require('crypto');

// Génère un code numérique à 6 chiffres (ex : "042517")
function generateSmsCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// On ne stocke jamais le code en clair : on garde son empreinte SHA-256.
function hashSmsCode(code) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

module.exports = { generateSetup, verifyCode, generateSmsCode, hashSmsCode };
