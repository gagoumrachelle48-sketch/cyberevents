const express = require('express');
const db = require('../db');
const { isVuln } = require('../config');
const sanitizeHtml = require('sanitize-html');

const router = express.Router();

// US-001 : liste + recherche d'événements
router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q;
    if (!q) {
      const { rows } = await db.query(
        'SELECT id,title,description,starts_at,price,reduced_price,capacity,category FROM events ORDER BY starts_at');
      return res.json(rows);
    }
    if (isVuln) {
      // VULN-1 (A03 Injection) : la recherche concatène l'entrée utilisateur dans le SQL.
      // Exploits : q=' OR '1'='1  |  q=x' UNION SELECT id,email,password,role,NULL,NULL,NULL,created_at FROM users--
      const sql = `SELECT id,title,description,starts_at,price,reduced_price,capacity,category
                   FROM events WHERE title ILIKE '%${q}%' OR description ILIKE '%${q}%' ORDER BY starts_at`;
      const { rows } = await db.query(sql);     // erreurs SQL renvoyées telles quelles (VULN-5)
      return res.json(rows);
    }
    // FIX-1 : requête paramétrée, l'entrée ne peut plus modifier la requête.
    const { rows } = await db.query(
      `SELECT id,title,description,starts_at,price,reduced_price,capacity,category
       FROM events WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY starts_at`, [`%${q}%`]);
    res.json(rows);
  } catch (e) { next(e); }
});

// US-001 : fiche d'un événement + ses commentaires
router.get('/:id', async (req, res, next) => {
  try {
    const ev = await db.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    if (!ev.rowCount) return res.status(404).json({ error: 'Événement introuvable' });
    const comments = await db.query(
      `SELECT c.id, c.content, c.created_at, u.full_name AS author
       FROM comments c LEFT JOIN users u ON u.id=c.user_id
       WHERE c.event_id=$1 ORDER BY c.created_at DESC`, [req.params.id]);
    res.json({ event: ev.rows[0], comments: comments.rows });
  } catch (e) { next(e); }
});

// US-007 : poster un commentaire
router.post('/:id/comments', async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
    let content = (req.body && req.body.content) || '';
    if (!content.trim()) return res.status(400).json({ error: 'Le commentaire est vide.' });
    // VULN-2 (A07 XSS stocké) : contenu enregistré brut, puis rendu sans échappement côté front.
    // Exploit : <script>alert(document.cookie)</script>  |  <img src=x onerror=alert(1)>
    if (!isVuln) content = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} }); // FIX-2
    const { rows } = await db.query(
      `INSERT INTO comments (event_id,user_id,content) VALUES ($1,$2,$3)
       RETURNING id, content, created_at`, [req.params.id, req.user.id, content]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
