const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const detection = require('../detection');

const router = express.Router();

// US-024 : image QR d'un billet (le contenu encodé est le qr_token)
// Accessible au propriétaire du billet.
router.get('/ticket/:id/qr', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT qr_token, user_id FROM tickets WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Billet introuvable' });
    // en mode secure, seul le propriétaire voit son QR ; en vuln, pas de contrôle (VULN-4)
    const png = await QRCode.toDataURL(rows[0].qr_token, { width: 240, margin: 1 });
    res.json({ qr: png, token: rows[0].qr_token });
  } catch (e) { next(e); }
});

// US-025 / US-027 : valider un QR scanné à l'entrée.
// Résultats possibles : valid, duplicate (déjà scanné), unknown (QR inconnu), wrong_event.
router.post('/scan', async (req, res, next) => {
  try {
    const { token, event_id, gate, controller } = req.body || {};
    if (!token) return res.status(400).json({ error: 'QR vide' });

    const t = await db.query(
      `SELECT t.id, t.event_id, t.scanned_at, e.title, u.full_name
       FROM tickets t JOIN events e ON e.id=t.event_id
       LEFT JOIN users u ON u.id=t.user_id
       WHERE t.qr_token=$1`, [token]);

    let result, detail = {};
    if (!t.rows.length) {
      result = 'unknown';                                   // US-027 : faux QR
      detection.raise('qr_fraud', 'high', req.ip, { token: token.slice(0, 12), reason: 'unknown' });
    } else {
      const tk = t.rows[0];
      if (event_id && Number(event_id) !== tk.event_id) {
        result = 'wrong_event';
        detail = { expected: tk.event_id, scanned_for: event_id };
      } else if (tk.scanned_at) {
        result = 'duplicate';                               // US-027 : doublon
        detail = { title: tk.title, holder: tk.full_name, first_scan: tk.scanned_at };
        detection.raise('qr_fraud', 'medium', req.ip, { token: token.slice(0, 12), reason: 'duplicate' });
      } else {
        result = 'valid';
        await db.query('UPDATE tickets SET scanned_at=NOW() WHERE id=$1', [tk.id]);
        detail = { title: tk.title, holder: tk.full_name };
      }
    }

    // journaliser le scan (US-026, alimente le suivi des entrées)
    await db.query(
      `INSERT INTO qr_scans (qr_token, ticket_id, event_id, gate, controller, result)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [token, t.rows[0]?.id || null, event_id || t.rows[0]?.event_id || null,
       gate || 'A', controller || 'scan-auto', result]);

    res.json({ result, ...detail });
  } catch (e) { next(e); }
});

// US-026 : suivi des entrées en temps réel (pour l'organisateur / contrôleur)
router.get('/entries', requireRole('admin', 'organizer', 'rssi'), async (req, res, next) => {
  try {
    const recent = await db.query(
      `SELECT s.result, s.gate, s.scanned_at, e.title AS event_title
       FROM qr_scans s LEFT JOIN events e ON e.id=s.event_id
       ORDER BY s.scanned_at DESC LIMIT 50`);
    const stats = await db.query(
      `SELECT result, COUNT(*)::int AS n FROM qr_scans GROUP BY result`);
    res.json({ recent: recent.rows, stats: stats.rows });
  } catch (e) { next(e); }
});

module.exports = router;
