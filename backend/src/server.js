const express = require('express');
const db = require('./db');
const { MODE, isVuln } = require('./config');
const httpLogger = require('./httpLogger');
const { readToken } = require('./auth');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(readToken);     // lit le JWT s'il existe (anonyme sinon)
app.use(httpLogger);    // T21 : après readToken pour tracer l'user_id

// FIX (sprint 2) : en-têtes de sécurité seulement en mode secure (US-016).
if (!isVuln) {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
}

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ok', mode: MODE, db: 'up' }); }
  catch { res.status(503).json({ status: 'degraded', mode: MODE, db: 'down' }); }
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.use((req, res) => res.status(404).json({ error: 'Route inconnue' }));

// VULN-5 (A05 Security Misconfiguration) : en mode labo, le détail technique de
// l'erreur (message SQL, pile) est renvoyé au client. FIX-5 : message générique.
app.use((err, req, res, next) => {
  console.error(err);
  if (isVuln) return res.status(500).json({ error: err.message, stack: err.stack, detail: err.detail });
  res.status(500).json({ error: 'Erreur interne' });
});

app.listen(4000, () => console.log(`API CyberEvents — mode ${MODE} — port 4000`));
