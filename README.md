# Plateforme Cyber-Événements

Billetterie en ligne servant de **laboratoire de cybersécurité**.
Le site est livré avec 5 vulnérabilités OWASP volontaires (mode labo),
puis corrigées (mode sécurisé). Il intègre la détection d'attaques en
temps réel, des modèles de machine learning, et un contrôle d'accès par QR codes.

Projet de rentrée ESIS-2 / CPDIA-2 — encadré par Joel BANKA.

---

## Équipe

Groupe de 5 — ESIS-2 / CPDIA-2.

| Membre | Filière | Rôle | Périmètre | Contact |
|--------|---------|------|-----------|---------|
| **ESSID Fatma** | CPDIA-DS | Product Owner | Backlog, priorités, KPI, démos | esfatma@etudiant-esic.fr |
| **Kelly GAGOUN** | ESIS-CIC | Scrum Master + Infra | Daily, Docker, base, logs, déploiement | gakelly@etudiant-esic.fr |
| **MBOUOPDA Darwin** | ESIS-CIC | Sécurité | Failles, corrections, alertes, rapport | mbdarwin@etudiant-esic.fr |
| **LOUKOU Franck** | ESIS-ILDE | Application | Billetterie, admin, espace client, QR | lofranck@etudiant-esic.fr |
| **MOALLA Rahma** | CPDIA-DS | Data / IA | Jeux de données, détection, fraude | morahma@etudiant-esic.fr |

Méthode agile (Scrum) sur 4 sprints, du 24 septembre au 21 octobre 2026.
Planning détaillé et répartition des 67 tâches : [`docs/Planning_Cyber-Evenements.pdf`](docs/Planning_Cyber-Evenements.pdf).

---

## Architecture

| Service | Rôle | Techno |
|---------|------|--------|
| `web` | Interface utilisateur | React (Vite) + nginx |
| `api` | API REST | Node.js / Express |
| `db` | Base de données | PostgreSQL 16 |
| `grafana` + `loki` + `promtail` | Monitoring et logs centralisés | pile Grafana |
| `ml/` | Modèles de détection (hors conteneur principal) | Python / scikit-learn |

Tout tourne dans Docker, sur un réseau privé isolé (VirtualBox host-only).

---

## Démarrage rapide

```bash
# 1. Configuration
cp .env.example .env
nano .env                 # renseigner les mots de passe

# 2. Lancer l'application
docker compose up -d --build

# 3. (optionnel) Lancer le monitoring
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Accès :
- Application : http://192.168.56.104:8080
- API (santé) : http://192.168.56.104:4000/api/health
- Grafana : http://192.168.56.104:3000 (admin / cyberadmin)

---

## Mode vulnérable / mode sécurisé

Un seul code, deux comportements via `APP_MODE` dans `.env` :

```bash
# Activer les failles (démo d'attaque)
sed -i 's/^APP_MODE=.*/APP_MODE=vuln/' .env && docker compose up -d --build api

# Activer les corrections (démo de défense)
sed -i 's/^APP_MODE=.*/APP_MODE=secure/' .env && docker compose up -d --build api
```

Les 5 failles et leurs corrections sont détaillées dans `FAILLES.md`.

---

## Comptes de démonstration

| Rôle | E-mail | Mot de passe |
|------|--------|--------------|
| Administrateur | admin@cyberevents.local | admin123 |
| RSSI (Sarah) | sarah@cyberevents.local | Sarah!2026 |
| Organisatrice (Lisa) | lisa@cyberevents.local | Lisa!2026 |
| Client (Marc) | marc@example.com | Marc!2026 |

> Les mots de passe des comptes de démo sont volontairement simples (mode labo).

---

## Fonctionnalités

**Billetterie** : catalogue d'événements, inscription, connexion (JWT),
achat avec paiement simulé, espace « mes billets », commentaires, administration (CRUD).

**Sécurité** : 5 failles OWASP (injection SQL, XSS stocké, mots de passe en clair,
contrôle d'accès cassé, erreurs exposées) et leurs corrections. Détection en temps
réel (SQLi, XSS, brute force), rate limiting, dashboard RSSI, journal d'audit.

**Machine learning** (`ml/`) : Random Forest (détection d'attaques HTTP),
Isolation Forest + règles métier (fraude à l'achat), K-means (segmentation).
Lancer avec `cd ml && pip install -r requirements.txt && python run_all.py`.

**QR codes** : billet avec QR, écran de scan à l'entrée, refus des doublons,
suivi des entrées en temps réel.

---

## Tests de sécurité

Les tests d'intrusion sont menés depuis une VM Kali isolée.

```bash
# Injection SQL (mode vuln : réussit ; mode secure : échoue)
sqlmap -u "http://192.168.56.104:4000/api/events?q=test" --batch --dbs --flush-session
```

Le rapport de vulnérabilités avant/après (avec preuves) est fourni séparément.

---

## Structure du dépôt

```
cyberevents/
├── backend/          API Express + PostgreSQL
│   ├── src/          routes, détection, logs, auth
│   └── db/init.sql   schéma complet + données de démo
├── frontend/         React (Vite) servi par nginx
├── ml/               modèles de machine learning
├── infra/            configuration Grafana, Loki, Promtail
├── docs/             planning, gestion de projet
├── logs/             journaux HTTP et alertes
├── docker-compose.yml
├── docker-compose.monitoring.yml
├── FAILLES.md        détail des 5 failles et corrections
└── README.md
```

---

## Gestion de projet

Le projet est mené en **méthode agile (Scrum)** sur 4 sprints (24 sept. → 21 oct. 2026) :

| Sprint | Période | Objectif |
|--------|---------|----------|
| Sprint 0 | 24 sept. | Cadrage, backlog, dépôt, stack |
| Sprint 1 | 25 sept. | Billetterie + 5 failles pédagogiques |
| Sprint 2 | 28 sept. → 16 oct. | Corrections OWASP, détection, ML, fraude |
| Sprint 3 | 19 → 21 oct. | QR d'entrée, monitoring, livrables |

Le planning complet, le rythme et la répartition des **67 tâches** (T01–T67) entre les
membres de l'équipe sont documentés dans
[`docs/Planning_Cyber-Evenements.pdf`](docs/Planning_Cyber-Evenements.pdf).
