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


// US-028 : file des achats suspects (transactions signalées par le scoring de fraude)
router.get('/fraud-queue', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT tr.id, tr.amount, tr.quantity, tr.status, tr.fraud_score, tr.ip,
              tr.card_last4, tr.created_at, u.email, e.title AS event_title
       FROM transactions tr
       LEFT JOIN users u ON u.id=tr.user_id
       LEFT JOIN events e ON e.id=tr.event_id
       WHERE tr.status='flagged' OR tr.fraud_score >= 0.5
       ORDER BY tr.fraud_score DESC, tr.created_at DESC LIMIT 200`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Revue d'un achat suspect : approuver (-> success) ou rejeter (-> failed)
router.post('/fraud-queue/:id/review', async (req, res, next) => {
  try {
    const decision = (req.body && req.body.decision) === 'approve' ? 'success' : 'failed';
    const { rows } = await db.query(
      'UPDATE transactions SET status=$1 WHERE id=$2 RETURNING id, status', [decision, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Transaction introuvable' });
    audit(req, 'fraud.review', `transaction:${req.params.id}`, { decision });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// US-029 : analytics de ventes + prévision des pics d'achat (persona Lisa, organisatrice)
// Prévision : tendance linéaire (moindres carrés) × saisonnalité par jour de semaine.
// Un jour prévu est marqué « pic » si sa prévision dépasse la moyenne + 1 écart-type.
function forecastSales(daily, horizon = 14) {
  if (!daily.length) return { forecast: [], peaks: [], trend: 0 };
  const rev = daily.map((d) => Number(d.revenue));
  const n = rev.length;
  const xs = rev.map((_, i) => i);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = rev.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (rev[i] - my); den += (x - mx) ** 2; });
  const a = den ? num / den : 0;          // pente de la tendance
  const b = my - a * mx;
  // saisonnalité : facteur moyen de chaque jour de semaine rapporté à la moyenne
  const dow = Array.from({ length: 7 }, () => []);
  daily.forEach((d) => { dow[new Date(d.date).getUTCDay()].push(Number(d.revenue)); });
  const avg = my || 1;
  const season = dow.map((arr) => (arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length) / avg : 1));
  const last = new Date(daily[daily.length - 1].date);
  const preds = [];
  for (let k = 1; k <= horizon; k++) {
    const dt = new Date(last); dt.setUTCDate(dt.getUTCDate() + k);
    const base = Math.max(0, a * (n - 1 + k) + b);
    const val = base * (season[dt.getUTCDay()] || 1);
    preds.push({ date: dt.toISOString().slice(0, 10), revenue_pred: Math.round(val * 100) / 100, is_peak: false });
  }
  const vals = preds.map((p) => p.revenue_pred);
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
  const thr = m + sd;
  preds.forEach((p) => { p.is_peak = sd > 0 && p.revenue_pred >= thr; });
  const peaks = [...daily].sort((x, y) => Number(y.revenue) - Number(x.revenue)).slice(0, 3)
    .map((d) => ({ date: d.date, revenue: Number(d.revenue) }));
  return { forecast: preds, peaks, trend: Math.round(a * 100) / 100 };
}

router.get('/analytics', async (req, res, next) => {
  try {
    const kpi = (await db.query(
      `SELECT COALESCE(SUM(amount),0)::float AS revenue,
              COALESCE(SUM(quantity),0)::int  AS tickets,
              COUNT(*)::int                   AS orders,
              COALESCE(AVG(amount),0)::float  AS avg_basket
       FROM transactions WHERE status='success'`)).rows[0];
    const byEvent = (await db.query(
      `SELECT e.title AS event_title,
              COALESCE(SUM(tr.amount),0)::float AS revenue,
              COALESCE(SUM(tr.quantity),0)::int AS tickets
       FROM transactions tr JOIN events e ON e.id=tr.event_id
       WHERE tr.status='success'
       GROUP BY e.title ORDER BY revenue DESC`)).rows;
    const daily = (await db.query(
      `SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD') AS date,
              SUM(amount)::float AS revenue, SUM(quantity)::int AS tickets
       FROM transactions
       WHERE status='success' AND created_at >= NOW() - INTERVAL '90 days'
       GROUP BY 1 ORDER BY 1`)).rows;
    const byHour = (await db.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(quantity)::int AS tickets
       FROM transactions WHERE status='success'
       GROUP BY 1 ORDER BY 1`)).rows;
    const { forecast, peaks, trend } = forecastSales(daily);
    res.json({ kpi, by_event: byEvent, daily, by_hour: byHour, forecast, peaks, trend });
  } catch (e) { next(e); }
});

module.exports = router;
