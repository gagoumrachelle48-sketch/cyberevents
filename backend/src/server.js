const express = require('express');
const db = require('./db');
const { MODE, isVuln } = require('./config');
const httpLogger = require('./httpLogger');
const { readToken } = require('./auth');
const detection = require('./detection');

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// CORS : autorise le front (hébergé sur un autre domaine en production)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONT_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(readToken);     // lit le JWT s'il existe (anonyme sinon)
app.use(httpLogger);    // T21 : après readToken pour tracer l'user_id
app.use(detection.scan);   // US-017 : détection SQLi/XSS en temps réel

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
app.use('/api/qr', require('./routes/qrRoutes'));

// US-019/020 : flux d'alertes pour le dashboard RSSI
app.get('/api/alerts', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id,type,severity,ip,details,status,created_at FROM security_alerts WHERE type<>'login_attempt' ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch { res.json([]); }
});
app.get('/api/alerts/stats', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT type, COUNT(*)::int AS n FROM security_alerts WHERE type<>'login_attempt' GROUP BY type ORDER BY n DESC");
    res.json(rows);
  } catch { res.json([]); }
});

// US-030 : métriques de santé (temps de réponse, uptime) — exposées pour Prometheus/Grafana
const bootTime = Date.now();
app.get('/api/metrics', async (req, res) => {
  let dbUp = true;
  const t0 = process.hrtime.bigint();
  try { await db.query('SELECT 1'); } catch { dbUp = false; }
  const dbMs = Number(process.hrtime.bigint() - t0) / 1e6;
  res.json({
    uptime_s: Math.round((Date.now() - bootTime) / 1000),
    db_up: dbUp, db_latency_ms: Number(dbMs.toFixed(2)),
    mode: MODE, memory_mb: Math.round(process.memoryUsage().rss / 1048576),
  });
});

app.use((req, res) => res.status(404).json({ error: 'Route inconnue' }));

// VULN-5 (A05 Security Misconfiguration) : en mode labo, le détail technique de
// l'erreur (message SQL, pile) est renvoyé au client. FIX-5 : message générique.
app.use((err, req, res, next) => {
  console.error(err);
  if (isVuln) return res.status(500).json({ error: err.message, stack: err.stack, detail: err.detail });
  res.status(500).json({ error: 'Erreur interne' });
});

const initIfNeeded = require('./initdb');
const PORT = process.env.PORT || 4000;
initIfNeeded().finally(() => {
  app.listen(PORT, () => console.log(`API CyberEvents — mode ${MODE} — port ${PORT}`));
});
