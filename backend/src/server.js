const express = require('express');
const db = require('./db');
const httpLogger = require('./httpLogger');

const app = express();
const MODE = process.env.APP_MODE || 'vuln';

app.set('trust proxy', true);           // vraie IP client derrière le proxy nginx
app.use(express.json());
app.use(httpLogger);

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', mode: MODE, db: 'up' });
  } catch (e) {
    res.status(503).json({ status: 'degraded', mode: MODE, db: 'down' });
  }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, title, description, starts_at, price, capacity, category FROM events ORDER BY starts_at'
    );
    res.json(rows);
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne' });
});

app.listen(4000, () => console.log(`API CyberEvents démarrée en mode ${MODE} sur :4000`));
