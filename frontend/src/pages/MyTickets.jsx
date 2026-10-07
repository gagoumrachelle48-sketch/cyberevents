import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function MyTickets() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    if (ready && !user) { nav('/connexion'); return; }
    if (user) api('/orders/my-tickets').then(setTickets).catch(() => {});
  }, [user, ready]);

  return (
    <>
      {tickets.length === 0 && <p className="muted">Vous n'avez pas encore de billet. Parcourez les événements pour réserver.</p>}
      {tickets.map((t) => (
        <div key={t.id} className="tk">
          <div>
            <h3>{t.title}</h3>
            <p className="muted" style={{ margin: '0 0 4px' }}>{fmtDate(t.starts_at)}</p>
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              Acheté le {fmtDate(t.bought_at)} · {t.amount} € · <span className="token mono">{t.qr_token.slice(0, 12)}…</span>
            </p>
          </div>
          <span className={`status ${t.scanned_at ? 'used' : 'valid'}`}>{t.scanned_at ? 'scanné' : 'valide'}</span>
        </div>
      ))}
    </>
  );
}
