-- Plateforme Cyber-Événements — schéma complet (prévu pour tous les sprints)

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  password      VARCHAR(255) NOT NULL,          -- US-009 : en clair en mode labo, haché en mode secure
  role          VARCHAR(20)  NOT NULL DEFAULT 'client'
                CHECK (role IN ('client','organizer','rssi','admin')),
  country       VARCHAR(2)   DEFAULT 'FR',      -- pour US-023 (géoloc déclarée vs IP)
  consent_at    TIMESTAMPTZ,                    -- RGPD
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  category      VARCHAR(50),
  starts_at     TIMESTAMPTZ  NOT NULL,
  price         NUMERIC(8,2) NOT NULL DEFAULT 0,
  reduced_price NUMERIC(8,2),                   -- early bird / étudiant
  capacity      INTEGER      NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (                         -- US-007 : cible du XSS stocké
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- T20 / US-010 : toutes les transactions, réussies ou non (source du modèle 2)
CREATE TABLE transactions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_id       INTEGER REFERENCES events(id) ON DELETE SET NULL,
  quantity       INTEGER      NOT NULL DEFAULT 1,
  amount         NUMERIC(8,2) NOT NULL,
  status         VARCHAR(20)  NOT NULL CHECK (status IN ('success','failed','pending','flagged')),
  payment_method VARCHAR(30)  DEFAULT 'card_simulated',
  card_last4     VARCHAR(4),
  card_hash      VARCHAR(64),                   -- même carte sur plusieurs comptes
  ip             VARCHAR(45),
  ip_country     VARCHAR(2),
  user_agent     TEXT,
  referer        TEXT,
  fraud_score    REAL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets (
  id          SERIAL PRIMARY KEY,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
  qr_token    VARCHAR(128) UNIQUE NOT NULL,     -- US-024
  scanned_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qr_scans (                         -- US-025 à US-027
  id          SERIAL PRIMARY KEY,
  qr_token    VARCHAR(128),
  ticket_id   INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  event_id    INTEGER REFERENCES events(id) ON DELETE SET NULL,
  gate        VARCHAR(30),
  controller  VARCHAR(60),
  result      VARCHAR(20) NOT NULL CHECK (result IN ('valid','duplicate','unknown','wrong_event')),
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE security_alerts (                  -- US-017 à US-019
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(40) NOT NULL,             -- sqli, xss, bruteforce, fraud, qr_fraud...
  severity    VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  ip          VARCHAR(45),
  details     JSONB,
  status      VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (                        -- T52 : actions administrateur
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(60) NOT NULL,
  target      VARCHAR(120),
  details     JSONB,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_ip_time   ON transactions (ip, created_at);
CREATE INDEX idx_tx_user_time ON transactions (user_id, created_at);
CREATE INDEX idx_alerts_time  ON security_alerts (created_at);

-- ---------- Données de démo ----------

-- Comptes des personas. US-008 : admin/admin123 volontairement faible (labo uniquement).
INSERT INTO users (email, full_name, password, role, consent_at) VALUES
  ('admin@cyberevents.local', 'Administrateur',  'admin123',      'admin',     NOW()),
  ('sarah@cyberevents.local', 'Sarah Chen',      'Sarah!2026',    'rssi',      NOW()),
  ('lisa@cyberevents.local',  'Lisa Martin',     'Lisa!2026',     'organizer', NOW()),
  ('marc@example.com',        'Marc Dubois',     'Marc!2026',     'client',    NOW());

-- Catalogue de l'expression de besoin (4 événements)
INSERT INTO events (title, description, category, starts_at, price, reduced_price, capacity) VALUES
  ('CyberSec Conference 2026',
   'Keynotes, workshops et networking autour de la cybersécurité.',
   'Conférence', NOW() + INTERVAL '2 months', 150, 120, 500),
  ('Hackathon IA & Cybersécurité',
   '48 heures pour construire des outils de défense augmentés par l''IA.',
   'Hackathon',  NOW() + INTERVAL '6 weeks',   50,  25, 100),
  ('Formation Red Team',
   'Session mensuelle de niveau expert : techniques offensives et méthodologie.',
   'Formation',  NOW() + INTERVAL '3 weeks',  800, NULL, 20),
  ('Webinar gratuit : tendances cyber',
   'Rendez-vous hebdomadaire en ligne, inscription obligatoire.',
   'Webinar',    NOW() + INTERVAL '5 days',     0, NULL, 1000);

-- US-008 (A07 session admin faible) : mot de passe admin par défaut, trivial.
-- Reste en clair en mode labo ; la correction (hachage + rotation) vient au sprint 2.
UPDATE users SET password='admin123' WHERE email='admin@cyberevents.local';

-- Commentaires de démonstration
INSERT INTO comments (event_id, user_id, content) VALUES
  (1, 4, 'Super événement l''an dernier, j''ai hâte !'),
  (1, 3, 'Le programme est en ligne ?'),
  (2, 4, 'Possible de venir en équipe de 3 ?');
