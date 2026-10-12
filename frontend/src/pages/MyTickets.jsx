import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function MyTickets() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [qr, setQr] = useState({});   // id -> dataURL

  useEffect(() => {
    if (ready && !user) { nav('/connexion'); return; }
    if (user) api('/orders/my-tickets').then(setTickets).catch(() => {});
  }, [user, ready]);

  const showQr = async (id) => {
    if (qr[id]) { setQr({ ...qr, [id]: null }); return; }   // toggle
    try { const d = await api(`/qr/ticket/${id}/qr`); setQr({ ...qr, [id]: d.qr }); }
    catch (e) { /* ignore */ }
  };

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
            <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => showQr(t.id)}>
              {qr[t.id] ? 'Masquer le QR' : 'Afficher le billet QR'}
            </button>
            {qr[t.id] && (
              <div className="qr-box">
                <img src={qr[t.id]} alt="QR du billet" width="200" height="200" />
                <p className="muted" style={{ fontSize: '.8rem' }}>Présentez ce QR à l'entrée</p>
              </div>
            )}
          </div>
          <span className={`status ${t.scanned_at ? 'used' : 'valid'}`}>{t.scanned_at ? 'scanné' : 'valide'}</span>
        </div>
      ))}
    </>
  );
}
