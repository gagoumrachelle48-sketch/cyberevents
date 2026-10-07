const bcrypt = require('bcryptjs');
const { isVuln } = require('./config');

const isHash = (s) => typeof s === 'string' && /^\$2[aby]\$/.test(s);

async function store(plain) {
  // VULN-3 (A02 Cryptographic Failures) : mot de passe enregistré en clair.
  if (isVuln) return plain;
  // FIX-3 : hachage bcrypt, coût 12.
  return bcrypt.hash(plain, 12);
}

// Accepte les deux formats pour que la base reste utilisable dans les deux modes.
async function verify(plain, stored) {
  return isHash(stored) ? bcrypt.compare(plain, stored) : plain === stored;
}

// FIX-3 bis : politique de mot de passe (mode secure uniquement)
function policyError(pw) {
  if (isVuln) return null;
  if (typeof pw !== 'string' || pw.length < 10) return 'Le mot de passe doit faire au moins 10 caractères.';
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw))
    return 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.';
  return null;
}

module.exports = { store, verify, isHash, policyError, bcrypt };
