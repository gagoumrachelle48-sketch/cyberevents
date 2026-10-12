"""
Générateur de jeux de données pour les modèles ML (T08, T33).
Produit, conformément à l'expression de besoin :
  - 1000 transactions légitimes + ~150 frauduleuses  -> transactions.csv
  - 2000 requêtes HTTP normales + 200 attaques        -> http_requests.csv
  - 500 scans de QR codes (valides, doublons, faux)   -> qr_scans.csv
Les colonnes correspondent à celles de la base PostgreSQL du projet.
"""
import csv, random, hashlib, json
from datetime import datetime, timedelta
import os

random.seed(42)
OUT = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(OUT, exist_ok=True)

EVENTS = [
    (1, 'CyberSec Conference 2026', 150.0),
    (2, 'Hackathon IA & Cybersécurité', 50.0),
    (3, 'Formation Red Team', 800.0),
    (4, 'Webinar gratuit', 0.0),
]
COUNTRIES = ['FR', 'FR', 'FR', 'FR', 'BE', 'CH', 'DE', 'ES']  # FR majoritaire
UA_NORMAL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/17.0',
    'Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0',
]
UA_BOT = ['sqlmap/1.8', 'python-requests/2.31', 'curl/8.5', 'Nikto/2.5']

def rand_ip(prefix=None):
    if prefix:
        return f'{prefix}.{random.randint(1,254)}'
    return f'{random.randint(1,223)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}'

def card_hash(num):
    return hashlib.sha256(str(num).encode()).hexdigest()

# ---------- 1. TRANSACTIONS ----------
def gen_transactions():
    rows = []
    base = datetime(2026, 4, 1)
    # 1000 légitimes réparties sur 6 mois
    for i in range(1000):
        ev = random.choice(EVENTS)
        qty = random.choices([1, 2, 3, 4], weights=[70, 20, 7, 3])[0]
        ts = base + timedelta(days=random.randint(0, 180), hours=random.randint(8, 23),
                              minutes=random.randint(0, 59))
        country = random.choice(COUNTRIES)
        card = random.randint(4000_0000_0000_0000, 4999_9999_9999_9999)
        # délai réaliste entre connexion et achat : 30s à 20min
        delay = random.randint(30, 1200)
        rows.append({
            'user_id': random.randint(1, 300), 'event_id': ev[0], 'quantity': qty,
            'amount': round(ev[2] * qty, 2), 'status': 'success',
            'payment_method': 'card_simulated', 'card_last4': str(card)[-4:],
            'card_hash': card_hash(card), 'ip': rand_ip(), 'ip_country': country,
            'login_to_buy_s': delay, 'is_fraud': 0,
            'created_at': ts.isoformat(),
        })
    # ~15% des transactions normales = clients atypiques légitimes (gros panier, achat rapide)
    for i in range(80):
        ev = random.choice(EVENTS[:3])
        ts = base + timedelta(days=random.randint(0,180), hours=random.randint(8,22))
        rows.append({
            'user_id': random.randint(1,300), 'event_id': ev[0],
            'quantity': random.choice([4,5,6]), 'amount': round(ev[2]*5,2),
            'status':'success','payment_method':'card_simulated',
            'card_last4':str(random.randint(1000,9999)),
            'card_hash':card_hash(random.randint(4000_0000_0000_0000,4999_9999_9999_9999)),
            'ip':rand_ip(),'ip_country':random.choice(['FR','BE','CH']),
            'login_to_buy_s':random.randint(15,60),'is_fraud':0,
            'created_at':ts.isoformat(),
        })
    # ~150 frauduleuses, dont certaines "prudentes" (recouvrement réaliste)
    for i in range(150):
        ev = random.choice(EVENTS[:3])  # pas le gratuit
        fraud_type = random.choice(['velocity', 'same_ip', 'geo_mismatch', 'card_testing'])
        ts = base + timedelta(days=random.randint(0, 180), hours=random.randint(0, 23))
        shared_ip = rand_ip('91.200.12')      # IP partagée suspecte
        shared_card = 4111_1111_1111_1111
        row = {
            'user_id': random.randint(301, 400), 'event_id': ev[0],
            'quantity': random.choice([5, 8, 10]), 'amount': 0,
            'status': 'flagged', 'payment_method': 'card_simulated',
            'card_last4': '1111', 'card_hash': card_hash(shared_card),
            'ip': shared_ip, 'ip_country': 'RU', 'login_to_buy_s': random.randint(1, 8),
            'is_fraud': 1, 'created_at': ts.isoformat(),
        }
        if fraud_type == 'velocity':
            row['quantity'] = random.choice([10, 15, 20])
            row['login_to_buy_s'] = random.randint(1, 4)
        elif fraud_type == 'card_testing':
            row['quantity'] = 1
            row['login_to_buy_s'] = random.randint(1, 3)
        # fraudeur prudent (~20%) : signaux atténués -> recouvrement avec les normales
        if random.random() < 0.20:
            row['ip_country'] = random.choice(['FR','BE'])
            row['login_to_buy_s'] = random.randint(20, 90)
            row['quantity'] = random.choice([2,3])
            row['card_hash'] = card_hash(random.randint(4000_0000_0000_0000,4999_9999_9999_9999))
        else:
            row['ip_country'] = random.choice(['RU', 'CN', 'NG'])
        row['amount'] = round(ev[2] * row['quantity'], 2)
        rows.append(row)
    random.shuffle(rows)
    path = os.path.join(OUT, 'transactions.csv')
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f'transactions.csv : {len(rows)} lignes ({sum(r["is_fraud"] for r in rows)} fraudes)')

# ---------- 2. REQUÊTES HTTP ----------
def gen_http():
    rows = []
    base = datetime(2026, 10, 1)
    normal_urls = ['/api/events', '/api/events/1', '/api/events/2', '/api/auth/login',
                   '/api/orders', '/api/orders/my-tickets', '/api/health', '/api/events?q=cyber']
    attack_payloads = [
        "/api/events?q=' OR '1'='1",
        "/api/events?q=x' UNION SELECT * FROM users--",
        "/api/events?q='; DROP TABLE users;--",
        "/api/events/1/comments<script>alert(1)</script>",
        "/api/events?q=<img src=x onerror=alert(document.cookie)>",
        "/api/events?q=javascript:alert(1)",
    ]
    # 2000 normales
    for i in range(2000):
        url = random.choice(normal_urls)
        ts = base + timedelta(seconds=random.randint(0, 11*24*3600))
        rows.append({
            'ts': ts.isoformat(), 'ip': rand_ip(), 'method': random.choice(['GET','GET','GET','POST']),
            'url': url, 'url_length': len(url),
            'n_params': url.count('=') + url.count('&'),
            'status': random.choices([200,200,200,304,401,404], weights=[50,20,10,10,5,5])[0],
            'ua': random.choice(UA_NORMAL), 'req_per_min_ip': random.randint(1, 15),
            'is_attack': 0,
        })
    # 200 attaques — dont ~30% furtives (UA normal, basse fréquence) pour du réalisme
    for i in range(200):
        url = random.choice(attack_payloads)
        ts = base + timedelta(seconds=random.randint(0, 11*24*3600))
        stealthy = random.random() < 0.30
        rows.append({
            'ts': ts.isoformat(), 'ip': rand_ip('91.200.12') if not stealthy else rand_ip(),
            'method': random.choice(['GET','POST']), 'url': url, 'url_length': len(url),
            'n_params': url.count('=') + url.count('&'),
            'status': random.choices([200,500,403], weights=[40,40,20])[0],
            'ua': random.choice(UA_NORMAL) if stealthy else random.choice(UA_BOT),
            'req_per_min_ip': random.randint(1, 10) if stealthy else random.randint(20, 120),
            'is_attack': 1,
        })
    # 60 requêtes normales "bruyantes" (recherche longue légitime) -> faux positifs plausibles
    for i in range(60):
        term = random.choice(['conférence networking workshop', 'formation avancée red team', 'hackathon équipe'])
        url = '/api/events?q=' + term.replace(' ', '%20')
        ts = base + timedelta(seconds=random.randint(0, 11*24*3600))
        rows.append({
            'ts': ts.isoformat(), 'ip': rand_ip(), 'method': 'GET', 'url': url,
            'url_length': len(url), 'n_params': 1,
            'status': 200, 'ua': random.choice(UA_NORMAL),
            'req_per_min_ip': random.randint(1, 12), 'is_attack': 0,
        })
    random.shuffle(rows)
    path = os.path.join(OUT, 'http_requests.csv')
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f'http_requests.csv : {len(rows)} lignes ({sum(r["is_attack"] for r in rows)} attaques)')

# ---------- 3. SCANS QR ----------
def gen_qr():
    rows = []
    base = datetime(2026, 10, 12, 8, 0)
    valid_tokens = [hashlib.md5(str(i).encode()).hexdigest()[:16] for i in range(400)]
    for i in range(500):
        r = random.random()
        ts = base + timedelta(minutes=random.randint(0, 240))
        if r < 0.82:          # valide
            token = random.choice(valid_tokens); result = 'valid'
        elif r < 0.92:        # doublon (déjà scanné)
            token = random.choice(valid_tokens); result = 'duplicate'
        elif r < 0.97:        # inconnu
            token = hashlib.md5(('fake'+str(i)).encode()).hexdigest()[:16]; result = 'unknown'
        else:                 # mauvais événement
            token = random.choice(valid_tokens); result = 'wrong_event'
        rows.append({
            'qr_token': token, 'event_id': random.choice([1,2,3]),
            'gate': random.choice(['A','B','C']), 'controller': f'ctrl_{random.randint(1,4)}',
            'result': result, 'is_fraud': 1 if result in ('duplicate','unknown') else 0,
            'scanned_at': ts.isoformat(),
        })
    path = os.path.join(OUT, 'qr_scans.csv')
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f'qr_scans.csv : {len(rows)} lignes ({sum(r["is_fraud"] for r in rows)} suspects)')

if __name__ == '__main__':
    gen_transactions()
    gen_http()
    gen_qr()
    print('\nJeux de données générés dans ml/data/')
