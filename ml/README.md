# Modèles ML — Plateforme Cyber-Événements

Trois modèles de machine learning répondant aux besoins du projet, exécutés
à la demande (approche data science classique : données → entraînement → métriques).

## Modèles

| # | Fichier | Rôle | Algorithme |
|---|---------|------|-----------|
| 1 | `model1_random_forest.py` | Détecter les requêtes HTTP malveillantes (SQLi, XSS) | Random Forest |
| 2 | `model2_isolation_forest.py` | Détecter la fraude à l'achat | Isolation Forest + règles métier |
| 3 | `model3_kmeans.py` | Segmenter les acheteurs par comportement | K-means |

## Lancer le pipeline complet
```bash
cd ml
pip install -r requirements.txt        # ou : docker build -t cyberevents-ml .
python run_all.py
```
Cela génère les données, entraîne les 3 modèles, et produit le rapport
`output/RAPPORT_ML.md` ainsi que les graphiques (matrices de confusion,
importances, scores, segments).

## Avec Docker
```bash
docker build -t cyberevents-ml .
docker run --rm -v "$PWD/output:/app/output" cyberevents-ml python run_all.py
```

## Structure
- `data/` : jeux de données générés (transactions, requêtes HTTP, scans QR)
- `models/` : modèles entraînés (.joblib)
- `output/` : rapport, graphiques, scores de fraude par transaction

## Résultats attendus
- Modèle 1 : F1 = 1,0 (confirmé en validation croisée 5 plis)
- Modèle 2 : F1 ≈ 0,81 (objectif > 0,80 atteint)
- Modèle 3 : 2 segments nets (clients réguliers vs achats de masse rapides)

## Réinjection des scores de fraude
`output/transactions_scored.csv` contient le `fraud_score` par transaction,
destiné à alimenter la colonne `fraud_score` de la table `transactions`
et la file « achats à vérifier » de l'interface organisateur.
