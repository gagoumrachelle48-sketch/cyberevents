# Plateforme Cyber-Événements

Billetterie en ligne servant de laboratoire de cybersécurité (projet ESIS-2/CPDIA-2).

## Démarrage
```bash
cp .env.example .env     # puis renseigner les mots de passe
docker compose up -d --build
```
- Front : http://192.168.56.104:8080
- API   : http://192.168.56.104:4000/api/health

## Modes
`APP_MODE=vuln` (failles actives) ou `APP_MODE=secure` (corrigées). Voir `FAILLES.md`.

## Comptes de démonstration
| Rôle | E-mail | Mot de passe |
|------|--------|--------------|
| Admin | admin@cyberevents.local | admin123 |
| RSSI (Sarah) | sarah@cyberevents.local | Sarah!2026 |
| Organisatrice (Lisa) | lisa@cyberevents.local | Lisa!2026 |
| Client (Marc) | marc@example.com | Marc!2026 |

## Structure
- `backend/`  API Express + PostgreSQL
- `frontend/` React (Vite) servi par nginx
- `logs/`     journaux HTTP (T21) et e-mails simulés
- `ml/`       modèles (sprints suivants)
