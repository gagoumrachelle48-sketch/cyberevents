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
}

module.exports = initIfNeeded;
