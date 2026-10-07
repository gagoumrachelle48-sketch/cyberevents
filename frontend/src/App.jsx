import { useEffect, useState } from 'react';

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtPrice = (p) => (Number(p) === 0 ? 'Gratuit' : `${Number(p).toFixed(0)} €`);

export default function App() {
  const [events, setEvents] = useState([]);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => {});
    fetch('/api/events')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setEvents)
      .catch(() => setError("Impossible de charger les événements. Vérifiez que l'API tourne."));
  }, []);

  return (
    <div className="page">
      <header className="top">
        <span className="brand">CyberEvents</span>
        {health && (
          <span className={`mode mode-${health.mode}`}>
            {health.mode === 'vuln' ? 'Version labo (vulnérable)' : 'Version sécurisée'}
          </span>
        )}
      </header>

      <main>
        <h1>Prochains événements</h1>
        {error && <p className="error">{error}</p>}
        <ul className="tickets">
          {events.map((e) => (
            <li key={e.id} className="ticket">
              <div className="ticket-body">
                <p className="cat">{e.category}</p>
                <h2>{e.title}</h2>
                <p className="desc">{e.description}</p>
              </div>
              <div className="ticket-stub">
                <p className="date">{fmtDate(e.starts_at)}</p>
                <p className="price">{fmtPrice(e.price)}</p>
                <p className="cap">{e.capacity} places</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
