import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = (query = '') => {
    setError('');
    api(`/events${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setEvents).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <form className="search" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un événement…" />
        <button type="submit">Rechercher</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="ev-list">
        {events.map((e) => {
          const free = Number(e.price) === 0;
          return (
            <Link to={`/evenements/${e.id}`} className="ev" key={e.id}>
              <div>
                <p className="cat">{e.category}</p>
                <h3>{e.title}</h3>
                <p className="desc">{e.description}</p>
              </div>
              <div className="meta">
                <div className="date">{fmtDate(e.starts_at)}</div>
                <div className={`price ${free ? 'free' : ''}`}>{free ? 'Gratuit' : `${Number(e.price).toFixed(0)} €`}</div>
                <div className="cap">{e.capacity} places</div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
