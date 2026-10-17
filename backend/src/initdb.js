// Charge le schéma et les données de démo au premier démarrage (pour Render).
// Sur Docker local, c'est l'image postgres qui s'en charge via /docker-entrypoint-initdb.d.
// Sur Render, la base est vide : on exécute init.sql une seule fois ici.
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function initIfNeeded() {
  try {
    // La table 'users' existe-t-elle déjà ?
    const check = await db.query(
      "SELECT to_regclass('public.users') AS t"
    );
    if (check.rows[0].t) {
      console.log('Base déjà initialisée.');
      return;
    }
    console.log('Initialisation de la base (première fois)…');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
    await db.query(sql);
    console.log('Base initialisée : schéma + données de démo chargés.');
  } catch (e) {
    console.error('Erreur init base :', e.message);
  }
  // Migrations idempotentes : appliquées à CHAQUE démarrage, que la base soit neuve
  // ou existante. Évite les erreurs « colonne manquante » après ajout d'un bonus.
  await runMigrations();
}

async function runMigrations() {
  const migrations = [
    // Bonus 2FA
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false",
    // Bonus détection de fraude (colonnes de transactions)
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_hash VARCHAR(64)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ip VARCHAR(45)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ip_country VARCHAR(2)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_agent TEXT",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS referer TEXT",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fraud_score REAL",
  ];
  for (const m of migrations) {
    try { await db.query(m); }
    catch (e) { console.error('[migration] ignorée :', m.slice(0, 50), '—', e.message); }
  }
  // Statut 'flagged' autorisé (si une ancienne base avait une contrainte plus stricte)
  try {
    await db.query('ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check');
    await db.query("ALTER TABLE transactions ADD CONSTRAINT transactions_status_check " +
      "CHECK (status IN ('success','failed','pending','flagged'))");
  } catch (e) { console.error('[migration] contrainte statut :', e.message); }
  console.log('Migrations vérifiées.');
}

module.exports = initIfNeeded;
