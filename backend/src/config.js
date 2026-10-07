// Un seul code, deux comportements :
//   APP_MODE=vuln   -> labo du sprint 1, 5 failles OWASP actives (repères VULN-1 à VULN-5)
//   APP_MODE=secure -> corrections du sprint 2 (repères FIX-1 à FIX-5)
const MODE = process.env.APP_MODE === 'secure' ? 'secure' : 'vuln';
module.exports = {
  MODE,
  isVuln: MODE === 'vuln',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
};
