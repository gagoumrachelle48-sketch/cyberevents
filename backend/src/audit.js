// T52 : piste d'audit des actions sensibles
const db = require('./db');
module.exports = (req, action, target, details = {}) =>
  db.query('INSERT INTO audit_log (user_id, action, target, details, ip) VALUES ($1,$2,$3,$4,$5)',
    [req.user ? req.user.id : null, action, target, details, req.ip]).catch(() => {});
