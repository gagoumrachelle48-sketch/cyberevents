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
    } else {
      console.log('Initialisation de la base (première fois)…');
      const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
      await db.query(sql);
      console.log('Base initialisée : schéma + données de démo chargés.');
    }
  } catch (e) {
    console.error('Erreur init base :', e.message);
  }
  // Migrations idempotentes : appliquées à CHAQUE démarrage, que la base soit neuve
  // ou existante. Évite les erreurs « colonne manquante » après ajout d'un bonus.
  await runMigrations();
  // US-029 : jeu de ventes de démonstration pour alimenter l'analytics (idempotent).
  await seedDemoSales();
}

// US-029 : génère ~700 ventes réussies sur 90 jours, avec saisonnalité (week-end) et
// quelques pics marketing, pour que l'analytics de ventes et la prévision soient parlantes.
// Ne s'exécute qu'une seule fois (si moins de 200 ventes réussies existent déjà).
async function seedDemoSales() {
  try {
    const { rows: cnt } = await db.query(
      "SELECT COUNT(*)::int AS n FROM transactions WHERE status='success'");
    if (cnt[0].n >= 200) { console.log('Ventes de démo déjà présentes.'); return; }
    const { rows: events } = await db.query('SELECT id, price FROM events');
    const { rows: users } = await db.query('SELECT id FROM users');
    if (!events.length || !users.length) return;
    const paid = events.filter((e) => Number(e.price) > 0);
    const pool = paid.length ? paid : events;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const peakDays = new Set([12, 40, 68]); // jours (il y a N jours) avec un pic d'achat
    const data = [];
    for (let d = 89; d >= 0; d--) {
      const date = new Date(); date.setDate(date.getDate() - d);
      const dow = date.getDay();
      let base = 3 + ((dow === 0 || dow === 6) ? 4 : 0) + Math.floor((89 - d) / 25);
      if (peakDays.has(d)) base += 14;
      const count = Math.max(0, Math.round(base + (Math.random() * 3 - 1)));
      for (let k = 0; k < count; k++) {
        const ev = pick(pool);
        const qty = 1 + Math.floor(Math.random() * 3);
        const amount = Math.round(qty * Number(ev.price) * 100) / 100;
        const ts = new Date(date);
        ts.setHours(8 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), 0, 0);
        const ip = '196.47.12.' + (1 + Math.floor(Math.random() * 250));
        data.push([pick(users).id, ev.id, qty, amount, ip, ts.toISOString()]);
      }
    }
    if (!data.length) return;
    const COLS = '(user_id,event_id,quantity,amount,status,payment_method,ip,ip_country,created_at)';
    for (let s = 0; s < data.length; s += 200) {
      const chunk = data.slice(s, s + 200);
      const ph = chunk.map((_, j) => {
        const o = j * 6;
        return `($${o+1},$${o+2},$${o+3},$${o+4},'success','card_simulated',$${o+5},'FR',$${o+6})`;
      }).join(',');
      await db.query(`INSERT INTO transactions ${COLS} VALUES ${ph}`, chunk.flat());
    }
    console.log(`Ventes de démo générées : ${data.length} transactions sur 90 jours.`);
  } catch (e) {
    console.error('[seedDemoSales] ignorée :', e.message);
  }
}

async function runMigrations() {
  const migrations = [
    // Bonus 2FA par application (TOTP)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false",
    // Bonus 2FA par SMS
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_code VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_code_expires TIMESTAMPTZ",
    // Bonus mot de passe oublié (réinitialisation par e-mail)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ",
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
