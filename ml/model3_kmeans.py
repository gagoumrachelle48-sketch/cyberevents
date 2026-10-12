"""
Modèle 3 — Segmentation des sessions utilisateurs par K-means (US-030 / T60).
Non supervisé : regroupe les comportements d'achat en profils types.
Sert à l'analyse métier (Lisa) et à repérer les segments atypiques.
"""
import os, json
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import joblib

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, 'data', 'transactions.csv')
OUT = os.path.join(HERE, 'output'); os.makedirs(OUT, exist_ok=True)
MODELS = os.path.join(HERE, 'models'); os.makedirs(MODELS, exist_ok=True)

def main():
    df = pd.read_csv(DATA)
    # agréger par utilisateur : panier moyen, nб d'achats, quantité moyenne, délai moyen
    g = df.groupby('user_id').agg(
        n_tx=('amount', 'count'),
        avg_amount=('amount', 'mean'),
        avg_qty=('quantity', 'mean'),
        avg_delay=('login_to_buy_s', 'mean'),
    ).reset_index()

    X = g[['n_tx', 'avg_amount', 'avg_qty', 'avg_delay']]
    Xs = StandardScaler().fit_transform(X)

    # choisir k par la silhouette (2 à 6)
    scores = {}
    for k in range(2, 7):
        km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(Xs)
        scores[k] = round(silhouette_score(Xs, km.labels_), 4)
    best_k = max(scores, key=scores.get)
    print('=== Modèle 3 — K-means (segmentation des sessions) ===')
    print('Silhouette par k :', scores)
    print('k retenu :', best_k)

    km = KMeans(n_clusters=best_k, random_state=42, n_init=10).fit(Xs)
    g['segment'] = km.labels_

    # profil de chaque segment
    profile = g.groupby('segment')[['n_tx','avg_amount','avg_qty','avg_delay']].mean().round(1)
    profile['taille'] = g.groupby('segment').size()
    print('\nProfil des segments :')
    print(profile.to_string())

    # visualisation 2D : panier moyen vs nombre d'achats
    fig, ax = plt.subplots(figsize=(6,4.5))
    sc = ax.scatter(g['avg_amount'], g['n_tx'], c=g['segment'], cmap='tab10', alpha=.7, s=30)
    ax.set_xlabel('Panier moyen (€)'); ax.set_ylabel('Nombre d\'achats')
    ax.set_title(f'Segments d\'acheteurs (K-means, k={best_k})')
    fig.colorbar(sc, label='segment'); fig.tight_layout()
    fig.savefig(os.path.join(OUT, 'kmeans_segments.png'), dpi=110)

    joblib.dump(km, os.path.join(MODELS, 'kmeans.joblib'))
    out = {'best_k': int(best_k), 'silhouette': scores, 'profile': profile.to_dict()}
    json.dump(out, open(os.path.join(OUT, 'kmeans_metrics.json'), 'w'), indent=2, default=str)
    print('\nModèle et graphique enregistrés.')

if __name__ == '__main__':
    main()
