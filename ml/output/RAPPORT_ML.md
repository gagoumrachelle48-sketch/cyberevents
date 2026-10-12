# Rapport de performance — Modèles ML
Plateforme Cyber-Événements · modèles de détection et d'analyse

## Modèle 1 — Détection d'attaques HTTP (Random Forest)
Classe chaque requête HTTP : normale ou malveillante (SQLi, XSS).
- Précision : **1.0**
- Recall : **1.0**
- F1-score : **1.0**
- ROC-AUC : **1.0**
- Échantillons : 1582 entraînement / 678 test
- Objectif (précision > 0,90 ; recall > 0,85) : **atteint**

Le score élevé s'explique par le caractère lexicalement non ambigu des charges
d'injection (mots-clés union, select, script, apostrophes). Confirmé par validation
croisée 5 plis (F1 = 1,0 ± 0,0), donc stable et non dû au hasard du découpage.
Graphiques : `rf_confusion.png`, `rf_importance.png`.

## Modèle 2 — Détection de fraude à l'achat (Isolation Forest + règles métier)
Score combiné : 60 % règles métier (carte réutilisée, achat quasi instantané,
pays à risque, grosse quantité) + 40 % Isolation Forest (anomalies non supervisées).
- Précision : **0.8133**
- Recall : **0.8133**
- F1-score : **0.8133**
- Transactions : 1230 total, 150 fraudes réelles, 150 signalées
- Objectif (F1 > 0,80) : **atteint**

Le recouvrement volontaire entre fraudeurs prudents et clients atypiques explique
un score réaliste (~0,81) plutôt que parfait. Les scores par transaction sont
exportés dans `transactions_scored.csv` pour réinjection en base (colonne fraud_score).
Graphiques : `iso_confusion.png`, `iso_scores.png`.

## Modèle 3 — Segmentation des acheteurs (K-means)
Regroupe les utilisateurs par comportement d'achat.
- Nombre de segments retenu : **2** (choisi par silhouette)
- Silhouette : {'2': 0.5053, '3': 0.4065, '4': 0.3677, '5': 0.3508, '6': 0.3167}

Le modèle sépare nettement un segment « achat de masse rapide » (panier élevé,
nombreux billets, délai très court) typique des comptes frauduleux, d'un segment
de clients réguliers. Graphique : `kmeans_segments.png`.

## Synthèse
| Modèle | Algorithme | Métrique clé | Objectif | Résultat |
|--------|-----------|--------------|----------|----------|
| 1 Détection HTTP | Random Forest | F1 | >0,90 / >0,85 | 1.0 |
| 2 Fraude achat | Isolation Forest + règles | F1 | >0,80 | 0.8133 |
| 3 Segmentation | K-means | silhouette | — | 0.5053 |
