// WhatsApp hybride (même principe que mailer.js) :
//   - si TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM sont définis
//     -> envoie un vrai message WhatsApp via l'API Twilio
//   - sinon -> journalise le message dans logs/whatsapp.log (mode démo)
// Dans tous les cas on garde une trace dans le fichier (utile pour la démonstration).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'logs', 'whatsapp.log');

const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
// numéro WhatsApp Twilio, ex : "whatsapp:+14155238886" (sandbox Twilio)
let FROM = process.env.TWILIO_WHATSAPP_FROM || '';
const enabled = !!(SID && TOKEN && FROM);

if (FROM && !FROM.startsWith('whatsapp:')) FROM = `whatsapp:${FROM}`;

if (enabled) {
  console.log(`[whatsapp] Twilio actif (from ${FROM})`);
} else {
  console.log('[whatsapp] Twilio non configuré -> messages écrits dans logs/whatsapp.log');
}

function logToFile(to, body, mediaUrl) {
  const msg = `---\nDate: ${new Date().toISOString()}\nTo: ${to}\n` +
    (mediaUrl ? `Media: ${mediaUrl}\n` : '') + `\n${body}\n`;
  fs.appendFile(FILE, msg, () => {});
}

function normalizeTo(to) {
  if (!to) return '';
  let t = String(to).trim();
  if (!t.startsWith('whatsapp:')) t = `whatsapp:${t}`;
  return t;
}

// Envoi : { to, body, mediaUrl? }. Renvoie une promesse { delivered, mode, ... }.
async function sendWhatsApp({ to, body, mediaUrl }) {
  const dest = normalizeTo(to);
  logToFile(dest || '(aucun destinataire)', body, mediaUrl);

  if (!dest) return { delivered: false, mode: 'file', error: 'destinataire manquant' };
  if (!enabled) return { delivered: false, mode: 'file' };

  try {
    const params = new URLSearchParams({ From: FROM, To: dest, Body: body });
    if (mediaUrl) params.append('MediaUrl', mediaUrl);

    const auth = Buffer.from(`${SID}:${TOKEN}`).toString('base64');
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('[whatsapp] echec Twilio :', resp.status, txt.slice(0, 200));
      return { delivered: false, mode: 'file', error: `HTTP ${resp.status}` };
    }
    return { delivered: true, mode: 'twilio' };
  } catch (e) {
    console.error('[whatsapp] erreur envoi, message conserve dans le fichier :', e.message);
    return { delivered: false, mode: 'file', error: e.message };
  }
}

module.exports = { sendWhatsApp, enabled };
