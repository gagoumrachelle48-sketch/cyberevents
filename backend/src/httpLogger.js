// T21 / US-011 : journal de toutes les requêtes HTTP, une ligne JSON par requête.
// Ce fichier alimente le Random Forest (modèle 1) et les règles de détection.
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'http.log');
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Les secrets ne vont jamais dans les logs, même en mode labo.
const SECRET_FIELDS = ['password', 'card_number', 'cvv', 'token', 'refresh_token'];
function redact(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  for (const f of SECRET_FIELDS) if (f in copy) copy[f] = '[REDACTED]';
  return copy;
}

module.exports = function httpLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    stream.write(JSON.stringify({
      ts: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      body: redact(req.body),
      status: res.statusCode,
      ua: req.get('user-agent') || '',
      referer: req.get('referer') || '',
      user_id: req.user ? req.user.id : null,
      duration_ms: Number(process.hrtime.bigint() - start) / 1e6,
    }) + '\n');
  });
  next();
};
