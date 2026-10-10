// Détection d'attaques en temps réel. Fonctionne dans les deux modes :
// en vuln elle observe (pour alimenter le dashboard RSSI), en secure elle observe aussi.
// Les alertes vont dans la table security_alerts (T38/US-019) et dans logs/alerts.log.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const ALERT_FILE = path.join(__dirname, '..', 'logs', 'alerts.log');
fs.mkdirSync(path.dirname(ALERT_FILE), { recursive: true });
const stream = fs.createWriteStream(ALERT_FILE, { flags: 'a' });

// US-017 : signatures d'injection SQL
const SQLI = /('|%27)|(--)|(\bunion\b)|(\bselect\b.*\bfrom\b)|(\bor\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+)|(\bdrop\b\s+\btable\b)/i;
// US-007/013 : signatures XSS
const XSS = /(<script)|(onerror\s*=)|(javascript:)|(<img[^>]+src\s*=)/i;

// US-018 : brute force — fenêtre glissante des échecs de login par IP
const loginFails = new Map();   // ip -> [timestamps]
const BF_WINDOW = 60 * 1000;
const BF_MAX = 5;

async function raise(type, severity, ip, details) {
  stream.write(JSON.stringify({ ts: new Date().toISOString(), type, severity, ip, details }) + '\n');
  db.query(
    'INSERT INTO security_alerts (type, severity, ip, details) VALUES ($1,$2,$3,$4)',
    [type, severity, ip, details]
  ).catch(() => {});
}

// Middleware : scanne URL + query + body de chaque requête
function scan(req, res, next) {
  const haystack = decodeURIComponent(req.originalUrl) + ' ' + JSON.stringify(req.body || {});
  if (SQLI.test(haystack)) raise('sqli', 'high', req.ip, { url: req.originalUrl, ua: req.get('user-agent') });
  else if (XSS.test(haystack)) raise('xss', 'medium', req.ip, { url: req.originalUrl });
  next();
}

// Appelé par la route login à chaque échec
function recordLoginFailure(ip, email) {
  const now = Date.now();
  const arr = (loginFails.get(ip) || []).filter((t) => now - t < BF_WINDOW);
  arr.push(now);
  loginFails.set(ip, arr);
  if (arr.length >= BF_MAX)
    raise('bruteforce', 'high', ip, { email, attempts: arr.length, window_s: BF_WINDOW / 1000 });
}

module.exports = { scan, recordLoginFailure, raise };
