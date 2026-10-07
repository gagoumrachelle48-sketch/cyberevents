// T21 / US-011 : journal de toutes les requêtes HTTP, une ligne JSON par requête.
// Ce fichier alimente le Random Forest (modèle 1) et les règles de détection.
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'http.log');
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

module.exports = function httpLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const entry = {
      ts: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      body: req.body,              // gardé volontairement en mode labo (payloads d'attaque)
      status: res.statusCode,
      ua: req.get('user-agent') || '',
      referer: req.get('referer') || '',
      user_id: req.user ? req.user.id : null,
      duration_ms: Number(process.hrtime.bigint() - start) / 1e6,
    };
    stream.write(JSON.stringify(entry) + '\n');
  });
  next();
};
