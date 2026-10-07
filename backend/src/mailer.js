// US-003 : e-mail de confirmation simulé, écrit dans logs/emails.log
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'logs', 'emails.log');

module.exports.send = (to, subject, body) => {
  const msg = `---\nDate: ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n\n${body}\n`;
  fs.appendFile(FILE, msg, () => {});
};
