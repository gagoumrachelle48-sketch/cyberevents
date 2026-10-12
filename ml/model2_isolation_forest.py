"""
Modèle 2 — Détection de fraude à l'achat par Isolation Forest (US-021, T44).
Non supervisé : apprend la forme des transactions normales et isole les anomalies.
Variables (expression de besoin) : montant, fréquence, géoloc vs IP, vitesse
connexion->achat, réutilisation de carte.
Objectif : F1 > 0.80 avec peu de faux positifs.
"""
import os, json
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import joblib

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, 'data', 'transactions.csv')
OUT = os.path.join(HERE, 'output'); os.makedirs(OUT, exist_ok=True)
MODELS = os.path.join(HERE, 'models'); os.makedirs(MODELS, exist_ok=True)

def featurize(df):
    # fréquence d'achats par IP (vélocité)
    ip_counts = df.groupby('ip')['user_id'].transform('count')
    df['ip_tx_count'] = ip_counts
    # réutilisation de carte (même empreinte sur plusieurs comptes)
    card_counts = df.groupby('card_hash')['user_id'].transform('nunique')
    df['card_reuse'] = card_counts
    # pays étranger (vs FR attendu)
    df['foreign'] = (~df['ip_country'].isin(['FR'])).astype(int)
    return df[['amount', 'quantity', 'login_to_buy_s', 'ip_tx_count', 'card_reuse', 'foreign']]

def main():
    df = pd.read_csv(DATA)
    X = featurize(df.copy())
    y_true = df['is_fraud'].values

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    # --- Isolation Forest (modèle non supervisé avancé) ---
    contamination = float(y_true.mean())
    iso = IsolationForest(n_estimators=300, contamination=contamination,
                          max_samples='auto', random_state=42)
    iso.fit(Xs)
    iso_score = -iso.score_samples(Xs)              # risque croissant
    iso_norm = (iso_score - iso_score.min()) / (np.ptp(iso_score) + 1e-9)

    # --- Règles métier (baseline demandée par le sujet) ---
    # signaux forts : carte réutilisée, achat quasi instantané, pays à risque, grosse quantité
    rules = (
        0.40 * (X['card_reuse'] > 3).astype(float) +
        0.25 * (X['login_to_buy_s'] < 10).astype(float) +
        0.20 * (X['foreign'] == 1).astype(float) +
        0.15 * (X['quantity'] >= 5).astype(float)
    )

    # --- Score combiné : 60% règles métier + 40% Isolation Forest ---
    score = 0.6 * rules.values + 0.4 * iso_norm
    # seuil : on signale la proportion attendue d'anomalies
    threshold = np.quantile(score, 1 - contamination)
    pred = (score >= threshold).astype(int)

    metrics = {
        'precision': round(precision_score(y_true, pred), 4),
        'recall': round(recall_score(y_true, pred), 4),
        'f1': round(f1_score(y_true, pred), 4),
        'contamination': round(contamination, 4),
        'n_total': len(df), 'n_fraud_real': int(y_true.sum()),
        'n_flagged': int(pred.sum()),
    }
    print('=== Modèle 2 — Isolation Forest (fraude à l\'achat) ===')
    print('Métriques :', json.dumps(metrics, indent=2))
    print('Objectif F1>0.80 :', 'ATTEINT' if metrics['f1'] > 0.8 else 'non atteint')

    cm = confusion_matrix(y_true, pred)
    fig, ax = plt.subplots(figsize=(4.5, 4))
    ax.imshow(cm, cmap='Oranges')
    ax.set_xticks([0,1]); ax.set_yticks([0,1])
    ax.set_xticklabels(['normal','fraude']); ax.set_yticklabels(['normal','fraude'])
    ax.set_xlabel('Prédit'); ax.set_ylabel('Réel'); ax.set_title('Isolation Forest — matrice de confusion')
    for i in range(2):
        for j in range(2):
            ax.text(j, i, cm[i,j], ha='center', va='center',
                    color='white' if cm[i,j]>cm.max()/2 else 'black', fontsize=14)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, 'iso_confusion.png'), dpi=110)

    # Distribution des scores de risque
    fig2, ax2 = plt.subplots(figsize=(6,4))
    ax2.hist(score[y_true==0], bins=40, alpha=.7, label='normales', color='#2a9d6f')
    ax2.hist(score[y_true==1], bins=40, alpha=.7, label='fraudes', color='#e4572e')
    ax2.set_xlabel('Score de risque'); ax2.set_ylabel('Nombre de transactions')
    ax2.set_title('Distribution des scores de risque'); ax2.legend()
    fig2.tight_layout(); fig2.savefig(os.path.join(OUT, 'iso_scores.png'), dpi=110)

    # Sauvegarde du modèle + scores par transaction (pour réinjection en base)
    joblib.dump({'model': iso, 'scaler': scaler}, os.path.join(MODELS, 'isolation_forest.joblib'))
    df_out = df.copy()
    df_out['fraud_score'] = np.round(score, 4)
    df_out['flagged'] = pred
    df_out[['user_id','event_id','amount','ip','fraud_score','flagged','is_fraud']].to_csv(
        os.path.join(OUT, 'transactions_scored.csv'), index=False)
    json.dump(metrics, open(os.path.join(OUT, 'iso_metrics.json'), 'w'), indent=2)
    print('\nModèle, scores et graphiques enregistrés.')

if __name__ == '__main__':
    main()
