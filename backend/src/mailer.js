// Email hybride :
//   - si SMTP_HOST / SMTP_USER / SMTP_PASS sont définis -> envoie un vrai email (nodemailer)
//   - sinon -> journalise l'email dans logs/emails.log (mode démo)
// Dans tous les cas on garde une trace dans le fichier (utile pour la démonstration).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'logs', 'emails.log');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@cyberevents.local';
const smtpEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (smtpEnabled) {
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = SSL direct, 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    console.log(`[mailer] SMTP actif via ${SMTP_HOST}:${SMTP_PORT} (${SMTP_USER})`);
  } catch (e) {
    console.error('[mailer] nodemailer indisponible, repli mode fichier :', e.message);
    transporter = null;
  }
} else {
  console.log('[mailer] SMTP non configuré -> emails écrits dans logs/emails.log');
}

function logToFile(to, subject, body, extra) {
  const msg = `---\nDate: ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n` +
    (extra ? `${extra}\n` : '') + `\n${body}\n`;
  fs.appendFile(FILE, msg, () => {});
}

// Envoi complet : { to, subject, text, html, attachments }. Renvoie une promesse.
async function sendMail({ to, subject, text, html, attachments }) {
  logToFile(to, subject, text || '(contenu HTML)',
    attachments && attachments.length ? `Pieces jointes: ${attachments.length}` : '');
  if (!transporter) return { delivered: false, mode: 'file' };
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html, attachments });
    return { delivered: true, mode: 'smtp' };
  } catch (e) {
    console.error('[mailer] echec SMTP, email conserve dans le fichier :', e.message);
    return { delivered: false, mode: 'file', error: e.message };
  }
}

// Compat : ancien appel simple texte (ne casse pas le code existant).
function send(to, subject, body) {
  return sendMail({ to, subject, text: body });
}

module.exports = { send, sendMail, smtpEnabled };
