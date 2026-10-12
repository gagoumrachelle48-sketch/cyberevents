"""
Modèle 1 — Détection d'attaques HTTP par Random Forest (US-017, T35).
Classe chaque requête HTTP : normale (0) ou malveillante (1).
Variables d'entrée (expression de besoin) : longueur URL, mots-clés suspects,
fréquence par IP, User-Agent inhabituel, code de réponse.
Objectif de performance : précision > 90 %, recall > 85 %.
"""
import os, json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (classification_report, confusion_matrix,
                             precision_score, recall_score, f1_score, roc_auc_score)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import joblib

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, 'data', 'http_requests.csv')
OUT = os.path.join(HERE, 'output'); os.makedirs(OUT, exist_ok=True)
MODELS = os.path.join(HERE, 'models'); os.makedirs(MODELS, exist_ok=True)

SUSPECT_KW = ['union', 'select', 'drop', 'script', 'onerror', 'javascript',
              "'", '--', 'alert', '<img', 'or 1=1', "or '1'='1"]
BOT_UA = ['sqlmap', 'nikto', 'curl', 'python-requests', 'nmap']

def featurize(df):
    u = df['url'].str.lower()
    df['kw_count'] = u.apply(lambda s: sum(k in s for k in SUSPECT_KW))
    df['has_quote'] = u.str.contains("'").astype(int)
    df['has_angle'] = u.str.contains('<').astype(int)
    df['ua_is_bot'] = df['ua'].str.lower().apply(lambda s: int(any(b in s for b in BOT_UA)))
    df['status_5xx'] = (df['status'] >= 500).astype(int)
    return df[['url_length', 'n_params', 'kw_count', 'has_quote', 'has_angle',
               'ua_is_bot', 'req_per_min_ip', 'status_5xx']]

def main():
    df = pd.read_csv(DATA)
    X = featurize(df.copy())
    y = df['is_attack']
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)

    clf = RandomForestClassifier(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
    clf.fit(X_tr, y_tr)
    pred = clf.predict(X_te)
    proba = clf.predict_proba(X_te)[:, 1]

    metrics = {
        'precision': round(precision_score(y_te, pred), 4),
        'recall': round(recall_score(y_te, pred), 4),
        'f1': round(f1_score(y_te, pred), 4),
        'roc_auc': round(roc_auc_score(y_te, proba), 4),
        'n_train': len(X_tr), 'n_test': len(X_te),
    }
    print('=== Modèle 1 — Random Forest (détection HTTP) ===')
    print(classification_report(y_te, pred, target_names=['normale', 'attaque']))
    print('Métriques :', json.dumps(metrics, indent=2))
    print('Objectif précision>0.90, recall>0.85 :',
          'ATTEINT' if metrics['precision'] > 0.9 and metrics['recall'] > 0.85 else 'non atteint')

    # Matrice de confusion
    cm = confusion_matrix(y_te, pred)
    fig, ax = plt.subplots(figsize=(4.5, 4))
    im = ax.imshow(cm, cmap='Oranges')
    ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
    ax.set_xticklabels(['normale', 'attaque']); ax.set_yticklabels(['normale', 'attaque'])
    ax.set_xlabel('Prédit'); ax.set_ylabel('Réel'); ax.set_title('Random Forest — matrice de confusion')
    for i in range(2):
        for j in range(2):
            ax.text(j, i, cm[i, j], ha='center', va='center',
                    color='white' if cm[i, j] > cm.max()/2 else 'black', fontsize=14)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, 'rf_confusion.png'), dpi=110)

    # Importance des variables
    imp = pd.Series(clf.feature_importances_, index=X.columns).sort_values()
    fig2, ax2 = plt.subplots(figsize=(6, 4))
    imp.plot.barh(ax=ax2, color='#e4572e')
    ax2.set_title('Importance des variables (Random Forest)')
    fig2.tight_layout(); fig2.savefig(os.path.join(OUT, 'rf_importance.png'), dpi=110)

    joblib.dump(clf, os.path.join(MODELS, 'random_forest.joblib'))
    json.dump(metrics, open(os.path.join(OUT, 'rf_metrics.json'), 'w'), indent=2)
    print('\nModèle et graphiques enregistrés dans ml/models/ et ml/output/')

if __name__ == '__main__':
    main()
