import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [qty, setQty] = useState(1);
  const [card, setCard] = useState('4111111111111111');
  const [msg, setMsg] = useState('');
  const [comment, setComment] = useState('');

  const load = () => api(`/events/${id}`).then(setData).catch(() => setMsg('Événement introuvable'));
  useEffect(() => { load(); }, [id]);

  const buy = async () => {
    setMsg('');
    try {
      const r = await api('/orders', { method: 'POST', body: { event_id: Number(id), quantity: qty, card_number: card } });
      setMsg(`Achat confirmé : ${r.tickets.length} billet(s), ${r.amount} €. Confirmation enregistrée.`);
    } catch (e) { setMsg(e.message); }
  };
  const postComment = async () => {
    try { await api(`/events/${id}/comments`, { method: 'POST', body: { content: comment } }); setComment(''); load(); }
    catch (e) { setMsg(e.message); }
  };

  if (!data) return <p className="muted">{msg || 'Chargement…'}</p>;
  const { event, comments } = data;
  const free = Number(event.price) === 0;

  return (
    <>
      <div className="detail-head">
        <p className="cat">{event.category}</p>
        <h1>{event.title}</h1>
        <p className="date">{fmtDate(event.starts_at)}</p>
        <p className="desc">{event.description}</p>
      </div>

      <section className="panel">
        <h2>Réserver</h2>
        {user ? (
          <div className="field-row">
            <label className="field">Quantité
              <input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
            <label className="field">Carte (simulée)
              <input className="mono" value={card} onChange={(e) => setCard(e.target.value)} /></label>
            <button onClick={buy}>Acheter — {free ? 'Gratuit' : `${event.price} €`}</button>
          </div>
        ) : (
          <p className="muted">Veuillez vous <button className="link" onClick={() => nav('/connexion')}>connecter</button> pour réserver.</p>
        )}
        {msg && <p className="info" style={{ marginTop: 14 }}>{msg}</p>}
      </section>

      <section className="panel">
        <h2>Commentaires <span className="hint">{comments.length}</span></h2>
        {user && (
          <div className="comment-form">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Partagez votre avis…" />
            <div><button onClick={postComment}>Publier</button></div>
          </div>
        )}
        <ul className="comments-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <div className="author">{c.author || 'Anonyme'}</div>
              {/* VULN-2 (XSS stocké) : rendu brut en mode labo. */}
              <div className="cbody" dangerouslySetInnerHTML={{ __html: c.content }} />
            </li>
          ))}
          {comments.length === 0 && <li className="muted">Aucun commentaire pour le moment.</li>}
        </ul>
      </section>
    </>
  );
}
