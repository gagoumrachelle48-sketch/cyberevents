"""Pipeline complet : génère les données puis entraîne les 3 modèles et produit le rapport."""
import subprocess, sys, os
HERE = os.path.dirname(__file__)
steps = ['generate_data.py', 'model1_random_forest.py',
         'model2_isolation_forest.py', 'model3_kmeans.py', 'report.py']
for s in steps:
    print(f'\n{"="*60}\n  {s}\n{"="*60}')
    r = subprocess.run([sys.executable, os.path.join(HERE, s)])
    if r.returncode != 0:
        print(f'ÉCHEC sur {s}'); sys.exit(1)
print('\n✓ Pipeline ML complet terminé. Voir ml/output/.')
