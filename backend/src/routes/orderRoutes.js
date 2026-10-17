const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../db');
const { requireAuth } = require('../auth');
const { makeLimiter } = require('../rateLimit');
const orderLimiter = makeLimiter({ windowMs: 60000, max: 10, message: 'Trop d\'achats en peu de temps.' });
const mailer = require('../mailer');
const whatsapp = require('../whatsapp');
const fraud = require('../fraud');
const detection = require('../detection');

const router = express.Router();

// URL publique de base (ex : https://cyberevents-api.onrender.com) pour joindre
// l'image du QR à un message WhatsApp. Vide en local -> message texte seulement.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

// US-003 : envoyer les billets (texte + QR si URL publique) par WhatsApp.
async function sendTicketsWhatsApp(to, event, tickets, amount) {
  // On n'interrompt pas si "to" est vide : whatsapp.sendWhatsApp journalise quand même
  // le message (utile pour la démo) puis s'abstient d'envoyer faute de destinataire.
  const lines = tickets.map((t, i) => `Billet ${i + 1} : ${t.qr_token}`).join('\n');
  const body =
    `CyberEvents — Vos billets\n\n${event.title}\n` +
    `Montant : ${amount} € — ${tickets.length} billet(s)\n\n${lines}\n\n` +
    `Présentez le QR code à l'entrée (valable une seule fois).`;
  // WhatsApp n'affiche qu'un seul média : on joint le QR du 1er billet si on a une URL publique.
  const mediaUrl = PUBLIC_BASE_URL
    ? `${PUBLIC_BASE_URL}/api/qr/img/${tickets[0].qr_token}.png`
    : null;
  return whatsapp.sendWhatsApp({ to, body, mediaUrl });
}

// US-003 / US-024 : composer et envoyer l'email contenant les billets + QR code.
// Chaque QR est intégré dans l'email comme image (pièce jointe en ligne via "cid").
async function sendTicketsEmail(to, event, tickets, amount) {
  const attachments = [];
  let cards = '';
  for (let i = 0; i < tickets.length; i++) {
    const tk = tickets[i];
    const cid = `qr${tk.id}@cyberevents`;
    const png = await QRCode.toBuffer(tk.qr_token, { width: 240, margin: 1 });
    attachments.push({ filename: `billet-${tk.id}.png`, content: png, cid });
    cards += `
      <tr><td style="padding:16px;border:1px solid #e5e7eb;text-align:center">
        <div style="font-weight:600;margin-bottom:8px">Billet n°${i + 1}</div>
        <img src="cid:${cid}" alt="QR code du billet" width="200" height="200" />
        <div style="font-family:monospace;font-size:11px;color:#6b7280;margin-top:6px">${tk.qr_token}</div>
      </td></tr>`;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="color:#f59e0b">CyberEvents — Vos billets</h2>
      <p>Merci pour votre achat ! Voici vos billets pour :</p>
      <p style="font-size:18px;font-weight:700">${event.title}</p>
      <p>Montant payé : <strong>${amount} €</strong> — ${tickets.length} billet(s)</p>
      <p>Présentez le QR code ci-dessous à l'entrée. Chaque QR n'est valable qu'une seule fois.</p>
      <table style="border-collapse:collapse;width:100%">${cards}</table>
      <p style="color:#6b7280;font-size:12px;margin-top:20px">
        CyberEvents — billet électronique. Ne partagez pas votre QR code.
      </p>
    </div>`;
  const text = `CyberEvents — Vos billets\n\n${event.title}\nMontant : ${amount} €\n\n` +
    tickets.map((t, i) => `Billet ${i + 1} : ${t.qr_token}`).join('\n') +
    `\n\nPrésentez le QR code à l'entrée (valable une seule fois).`;
  return mailer.sendMail({ to, subject: `Vos billets — ${event.title}`, text, html, attachments });
}

// US-003 : acheter un billet (paiement simulé) -> transaction + billets + QR
router.post('/', requireAuth, orderLimiter, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { event_id, quantity, card_number } = req.body || {};
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    const ev = await client.query('SELECT * FROM events WHERE id=$1', [event_id]);
    if (!ev.rowCount) return res.status(404).json({ error: 'Événement introuvable' });
    const price = Number(ev.rows[0].price);
    const amount = price * qty;

    const last4 = (card_number || '0000').toString().slice(-4);
    const cardHash = crypto.createHash('sha256').update((card_number || '').toString()).digest('hex');

    // Scoring de fraude en temps réel (règles issues du modèle Isolation Forest)
    const risk = await fraud.scoreTransaction({ userId: req.user.id, cardHash, ip: req.ip, quantity: qty, amount });
    const status = risk.flagged ? 'flagged' : 'success';

    await client.query('BEGIN');
    const tx = await client.query(
      `INSERT INTO transactions
         (user_id,event_id,quantity,amount,status,payment_method,card_last4,card_hash,ip,ip_country,user_agent,referer,fraud_score)
       VALUES ($1,$2,$3,$4,$5,'card_simulated',$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, amount, created_at`,
      [req.user.id, event_id, qty, amount, status, last4, cardHash, req.ip, 'FR',
       req.get('user-agent') || '', req.get('referer') || '', risk.score]);
    const txId = tx.rows[0].id;

    const tickets = [];
    for (let i = 0; i < qty; i++) {
      const token = crypto.randomBytes(16).toString('hex'); // US-024 : jeton du QR
      const t = await client.query(
        `INSERT INTO tickets (transaction_id,user_id,event_id,qr_token)
         VALUES ($1,$2,$3,$4) RETURNING id, qr_token`, [txId, req.user.id, event_id, token]);
      tickets.push(t.rows[0]);
    }
    await client.query('COMMIT');

    // Destinataire WhatsApp : téléphone du compte si renseigné, sinon numéro de démo.
    const waTo = (req.user.phone || process.env.DEMO_WHATSAPP_TO || '').trim();

    if (risk.flagged) {
      detection.raise('fraud', 'high', req.ip,
        { transaction: txId, score: risk.score, reasons: risk.reasons });
      // Achat bloqué : pas d'envoi de billets. Les billets partiront après validation admin.
      const pendingMsg = `Votre achat de ${qty} billet(s) pour « ${ev.rows[0].title} » (${amount} €) ` +
        `est en cours de vérification par notre équipe sécurité. ` +
        `Vous recevrez vos billets dès validation.`;
      // Promise.resolve(...) : ne plante pas même si une fonction ne renvoie pas de promesse.
      Promise.resolve(mailer.send(req.user.email, 'Achat en cours de vérification', pendingMsg)).catch(() => {});
      Promise.resolve(whatsapp.sendWhatsApp({ to: waTo, body: `CyberEvents — ${pendingMsg}` })).catch(() => {});
    } else {
      // Achat validé : envoi automatique des billets avec leur QR code (email + WhatsApp).
      Promise.resolve(sendTicketsEmail(req.user.email, ev.rows[0], tickets, amount)).catch(() => {});
      Promise.resolve(sendTicketsWhatsApp(waTo, ev.rows[0], tickets, amount)).catch(() => {});
    }

    res.status(201).json({ transaction_id: txId, amount, tickets, flagged: risk.flagged });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

// US-005 : mes billets
router.get('/my-tickets', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT t.id, t.qr_token, t.scanned_at, e.title, e.starts_at, tr.amount, tr.created_at AS bought_at
       FROM tickets t
       JOIN events e ON e.id=t.event_id
       JOIN transactions tr ON tr.id=t.transaction_id
       WHERE t.user_id=$1 ORDER BY tr.created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
