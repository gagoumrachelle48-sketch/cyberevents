const express = require('express');
const db = require('../db');
const { requireRole } = require('../auth');
const audit = require('../audit');

const router = express.Router();
// requireRole applique le contrôle en mode secure ; en mode vuln il laisse passer (VULN-4).
router.use(requireRole('admin', 'organizer'));

// US-004 : CRUD événements
router.post('/events', async (req, res, next) => {
  try {
    const { title, description, category, starts_at, price, reduced_price, capacity } = req.body || {};
    const { rows } = await db.query(
      `INSERT INTO events (title,description,category,starts_at,price,reduced_price,capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description, category, starts_at, price || 0, reduced_price || null, capacity || 0]);
    audit(req, 'event.create', `event:${rows[0].id}`, { title });
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.put('/events/:id', async (req, res, next) => {
  try {
    const { title, description, category, starts_at, price, reduced_price, capacity } = req.body || {};
    const { rows } = await db.query(
      `UPDATE events SET title=$1,description=$2,category=$3,starts_at=$4,price=$5,reduced_price=$6,capacity=$7
       WHERE id=$8 RETURNING *`,
      [title, description, category, starts_at, price, reduced_price, capacity, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Événement introuvable' });
    audit(req, 'event.update', `event:${req.params.id}`, { title });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/events/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM events WHERE id=$1', [req.params.id]);
    audit(req, 'event.delete', `event:${req.params.id}`);
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

// Gestion des utilisateurs
router.get('/users', async (req, res, next) => {
  try {
    // VULN-5 (A05) renforcé : en mode vuln on renvoie aussi le mot de passe.
    const cols = require('../config').isVuln
      ? 'id,email,full_name,role,password,created_at'
      : 'id,email,full_name,role,created_at';
    const { rows } = await db.query(`SELECT ${cols} FROM users ORDER BY id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Vue organisateur : transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT tr.*, u.email, e.title AS event_title
       FROM transactions tr
       LEFT JOIN users u ON u.id=tr.user_id
       LEFT JOIN events e ON e.id=tr.event_id
       ORDER BY tr.created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
