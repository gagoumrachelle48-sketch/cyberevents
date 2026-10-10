// T30 : limitation de débit par IP, en mémoire. Actif seulement en mode secure.
// Protège /login (brute force) et /orders (card testing / velocity).
const { isVuln } = require('./config');

function makeLimiter({ windowMs, max, message }) {
  const hits = new Map();   // ip -> [timestamps]
  return (req, res, next) => {
    if (isVuln) return next();              // mode labo : aucune limite (brute force possible)
    const now = Date.now();
    const arr = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(req.ip, arr);
    if (arr.length > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message || 'Trop de requêtes, réessayez plus tard.' });
    }
    next();
  };
}

// Nettoyage périodique pour ne pas garder d'IP en mémoire indéfiniment
module.exports = { makeLimiter };
