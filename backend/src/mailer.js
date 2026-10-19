// Email hybride, 3 modes (par ordre de priorité) :
//   1. API Brevo (HTTPS) si BREVO_API_KEY est défini  -> fonctionne même quand l'hébergeur bloque le SMTP (cas Render gratuit)
//   2. SMTP (nodemailer) si SMTP_HOST/USER/PASS sont définis
//   3. sinon -> journalise l'email dans logs/emails.log (mode démo)
// Dans tous les cas on garde une trace dans le fichier (utile pour la démonstration).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'logs', 'emails.log');

// --- Expéditeur commun ---
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@cyberevents.local';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'CyberEvents';

// --- Mode 1 : Brevo (API HTTPS) ---
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const brevoEnabled = !!BREVO_API_KEY;

// --- Mode 2 : SMTP ---
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const smtpEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (brevoEnabled) {
  console.log(`[mailer] API Brevo active (expéditeur ${MAIL_FROM})`);
} else if (smtpEnabled) {
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    console.log(`[mailer] SMTP actif via ${SMTP_HOST}:${SMTP_PORT} (${SMTP_USER})`);
  } catch (e) {
    console.error('[mailer] nodemailer indisponible, repli mode fichier :', e.message);
    transporter = null;
  }
} else {
  console.log('[mailer] aucun fournisseur configuré -> emails écrits dans logs/emails.log');
}

function logToFile(to, subject, body, extra) {
  const msg = `---\nDate: ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n` +
    (extra ? `${extra}\n` : '') + `\n${body}\n`;
  fs.appendFile(FILE, msg, () => {});
}

// Convertit les pièces jointes nodemailer -> format Brevo (base64).
function toBrevoAttachments(attachments) {
  return (attachments || []).map((a) => {
    let content = a.content;
    if (Buffer.isBuffer(content)) content = content.toString('base64');
    else if (typeof content === 'string') content = Buffer.from(content).toString('base64');
    else return null;
    return { name: a.filename || a.name || 'fichier', content };
  }).filter(Boolean);
}

// Envoi via l'API transactionnelle Brevo (HTTPS, non bloqué par l'hébergeur).
async function sendViaBrevo({ to, subject, text, html, attachments }) {
  const payload = {
    sender: { email: MAIL_FROM, name: MAIL_FROM_NAME },
    to: [{ email: to }],
    subject,
    htmlContent: html || `<pre>${(text || '').replace(/</g, '&lt;')}</pre>`,
    textContent: text || undefined,
  };
  const atts = toBrevoAttachments(attachments);
  if (atts.length) payload.attachment = atts;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status} ${detail.slice(0, 200)}`);
  }
  return true;
}

// Envoi complet : { to, subject, text, html, attachments }. Renvoie une promesse.
async function sendMail({ to, subject, text, html, attachments }) {
  logToFile(to, subject, text || '(contenu HTML)',
    attachments && attachments.length ? `Pieces jointes: ${attachments.length}` : '');

  // Mode 1 : Brevo (prioritaire)
  if (brevoEnabled) {
    try {
      await sendViaBrevo({ to, subject, text, html, attachments });
      return { delivered: true, mode: 'brevo' };
    } catch (e) {
      console.error('[mailer] echec Brevo, email conserve dans le fichier :', e.message);
      // on tente le SMTP en secours s'il est configuré, sinon fichier
    }
  }

  // Mode 2 : SMTP
  if (transporter) {
    try {
      await transporter.sendMail({ from: MAIL_FROM, to, subject, text, html, attachments });
      return { delivered: true, mode: 'smtp' };
    } catch (e) {
      console.error('[mailer] echec SMTP, email conserve dans le fichier :', e.message);
      return { delivered: false, mode: 'file', error: e.message };
    }
  }

  // Mode 3 : fichier
  return { delivered: false, mode: 'file' };
}

// Compat : ancien appel simple texte (ne casse pas le code existant).
function send(to, subject, body) {
  return sendMail({ to, subject, text: body });
}

module.exports = { send, sendMail, smtpEnabled, brevoEnabled };
