// SMS hybride (même principe que mailer.js / whatsapp.js) :
//   - si TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM sont définis
//     -> envoie un vrai SMS via l'API Twilio
//   - sinon -> journalise le SMS dans logs/sms.log (mode démo)
// Dans tous les cas on garde une trace dans le fichier (utile pour la démonstration).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'logs', 'sms.log');

const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_SMS_FROM || ''; // numéro SMS Twilio, ex : "+15551234567"
const enabled = !!(SID && TOKEN && FROM);

if (enabled) console.log(`[sms] Twilio actif (from ${FROM})`);
else console.log('[sms] Twilio non configuré -> SMS écrits dans logs/sms.log');

function logToFile(to, body) {
  const msg = `---\nDate: ${new Date().toISOString()}\nTo: ${to}\n\n${body}\n`;
  fs.appendFile(FILE, msg, () => {});
}

// Envoi : { to, body }. Renvoie une promesse { delivered, mode, ... }.
async function sendSMS({ to, body }) {
  const dest = (to || '').trim();
  logToFile(dest || '(aucun destinataire)', body);

  if (!dest) return { delivered: false, mode: 'file', error: 'destinataire manquant' };
  if (!enabled) return { delivered: false, mode: 'file' };

  try {
    const params = new URLSearchParams({ From: FROM, To: dest, Body: body });
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
      console.error('[sms] echec Twilio :', resp.status, txt.slice(0, 200));
      return { delivered: false, mode: 'file', error: `HTTP ${resp.status}` };
    }
    return { delivered: true, mode: 'twilio' };
  } catch (e) {
    console.error('[sms] erreur envoi, message conserve dans le fichier :', e.message);
    return { delivered: false, mode: 'file', error: e.message };
  }
}

module.exports = { sendSMS, enabled };
