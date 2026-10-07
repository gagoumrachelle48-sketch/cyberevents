const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../auth');
const mailer = require('../mailer');

const router = express.Router();

// US-003 : acheter un billet (paiement simulé) -> transaction + billets + QR
router.post('/', requireAuth, async (req, res, next) => {
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

    await client.query('BEGIN');
    const tx = await client.query(
      `INSERT INTO transactions
         (user_id,event_id,quantity,amount,status,payment_method,card_last4,card_hash,ip,ip_country,user_agent,referer)
       VALUES ($1,$2,$3,$4,'success','card_simulated',$5,$6,$7,$8,$9,$10)
       RETURNING id, amount, created_at`,
      [req.user.id, event_id, qty, amount, last4, cardHash, req.ip, 'FR',
       req.get('user-agent') || '', req.get('referer') || '']);
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

    mailer.send(req.user.email, 'Confirmation de votre achat',
      `Merci ! ${qty} billet(s) pour « ${ev.rows[0].title} ». Montant : ${amount} €.`);
    res.status(201).json({ transaction_id: txId, amount, tickets });
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
