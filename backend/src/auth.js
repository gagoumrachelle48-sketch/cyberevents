const jwt = require('jsonwebtoken');
const { JWT_SECRET, isVuln } = require('./config');

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name },
    JWT_SECRET, { expiresIn: '8h' });
}

// Lit le jeton s'il est présent, sans bloquer (sert aussi au logger)
function readToken(req, res, next) {
  const h = req.get('authorization') || '';
  if (h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch { /* jeton invalide : anonyme */ }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
    // VULN-4 (A01 Broken Access Control) : en mode labo, le rôle n'est PAS vérifié côté serveur.
    // Seule l'interface masque le menu admin : n'importe quel client connecté peut appeler /api/admin/*.
    if (isVuln) return next();
    // FIX-4 : contrôle du rôle côté serveur, systématique.
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}

module.exports = { sign, readToken, requireAuth, requireRole };
