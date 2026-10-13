// Scoring de fraude en temps réel à l'achat.
// Reprend, sous forme de règles métier, les signaux appris par le modèle
// Isolation Forest (voir ml/model2_isolation_forest.py) : carte réutilisée,
// vélocité par IP, grosse quantité, montant élevé.
// Retourne { score: 0..1, reasons: [...], flagged: bool }.
const db = require('./db');

async function scoreTransaction({ userId, cardHash, ip, quantity, amount }) {
  const reasons = [];
  let score = 0;

  // 1. Même carte utilisée par plusieurs comptes (signal le plus fort du modèle)
  try {
    const r = await db.query(
      'SELECT COUNT(DISTINCT user_id) AS n FROM transactions WHERE card_hash=$1 AND user_id <> $2',
      [cardHash, userId]);
    const others = Number(r.rows[0].n);
    if (others >= 2) { score += 0.50; reasons.push(`Carte déjà utilisée par ${others + 1} comptes`); }
    else if (others === 1) { score += 0.25; reasons.push('Carte partagée avec un autre compte'); }
  } catch { /* ignore */ }

  // 2. Vélocité : plusieurs achats depuis la même IP en peu de temps
  try {
    const r = await db.query(
      "SELECT COUNT(*) AS n FROM transactions WHERE ip=$1 AND created_at > NOW() - INTERVAL '10 minutes'",
      [ip]);
    const recent = Number(r.rows[0].n);
    if (recent >= 3) { score += 0.30; reasons.push(`${recent} achats depuis la même IP en 10 min`); }
    else if (recent === 2) { score += 0.15; reasons.push('Achats rapprochés depuis la même IP'); }
  } catch { /* ignore */ }

  // 3. Quantité anormale
  if (quantity >= 8) { score += 0.25; reasons.push(`Quantité très élevée (${quantity} billets)`); }
  else if (quantity >= 5) { score += 0.15; reasons.push(`Quantité importante (${quantity} billets)`); }

  // 4. Montant élevé
  if (Number(amount) >= 2000) { score += 0.10; reasons.push('Montant élevé'); }

  score = Math.min(1, score);
  return { score: Number(score.toFixed(2)), reasons, flagged: score >= 0.5 };
}

module.exports = { scoreTransaction };
