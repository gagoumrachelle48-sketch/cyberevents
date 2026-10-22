import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api';

const RESULT_UI = {
  valid:       { label: 'ACCÈS AUTORISÉ', cls: 'ok' },
  duplicate:   { label: 'DÉJÀ SCANNÉ — REFUSÉ', cls: 'danger' },
  unknown:     { label: 'QR INCONNU — REFUSÉ', cls: 'danger' },
  wrong_event: { label: 'MAUVAIS ÉVÉNEMENT', cls: 'warn' },
};

export default function ScanPage() {
  const [token, setToken] = useState('');
  const [last, setLast] = useState(null);
  const [entries, setEntries] = useState({ recent: [], stats: [] });
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');   // '' = tous les événements
  const scannerRef = useRef(null);
  const eventIdRef = useRef('');
  eventIdRef.current = eventId;

  const load = () => {
    const qs = eventIdRef.current ? `?event_id=${eventIdRef.current}` : '';
    api('/qr/entries' + qs).then(setEntries).catch(() => {});
  };
  // charger la liste des événements (une fois)
  useEffect(() => { api('/events').then(setEvents).catch(() => {}); }, []);
  // (re)charger le suivi quand l'événement contrôlé change + rafraîchir en continu
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [eventId]);
  // Arrêter la caméra si on quitte la page
  useEffect(() => () => { stopCamera(); }, []);

  // Envoie un token au serveur (depuis la saisie ou la caméra)
  const doScan = async (value) => {
    const t = (value || '').trim();
    if (!t) return;
    try {
      const body = { token: t, gate: 'A', controller: 'poste-1' };
      if (eventIdRef.current) body.event_id = Number(eventIdRef.current);
      const r = await api('/qr/scan', { method: 'POST', body });
      setLast(r); setToken(''); load();
    } catch { setLast({ result: 'unknown' }); }
  };
  const scan = (e) => { e?.preventDefault(); doScan(token); };

  // Démarrer la caméra et lire le QR
  const startCamera = async () => {
    setCamError(''); setScanning(true);
    setTimeout(async () => {
      try {
        const html5 = new Html5Qrcode('reader');
        scannerRef.current = html5;
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          async (decoded) => { await stopCamera(); doScan(decoded); },
          () => {}   // ignore les erreurs de lecture image par image
        );
      } catch {
        setScanning(false);
        setCamError("Caméra inaccessible. Sur une adresse HTTP, le navigateur bloque la caméra : utilise le lien HTTPS (en ligne) ou colle le token à la main.");
      }
    }, 120);
  };

  const stopCamera = async () => {
    const s = scannerRef.current;
    if (s) { try { await s.stop(); await s.clear(); } catch { /* déjà arrêtée */ } scannerRef.current = null; }
    setScanning(false);
  };

  const stat = (k) => entries.stats.find((s) => s.result === k)?.n || 0;

  return (
    <>
      <div className="scan-grid">
        <section className="panel">
          <h2>Scanner un billet</h2>
          <label className="field scan-event-pick">Événement à contrôler
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Tous les événements</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          </label>
          <form onSubmit={scan} className="scan-form">
            <input className="mono" value={token} onChange={(e) => setToken(e.target.value)}
                   placeholder="Collez le token du QR ici" autoFocus />
            <button type="submit">Valider l'entrée</button>
          </form>

          <div style={{ marginTop: 10 }}>
            {!scanning
              ? <button type="button" className="btn-ghost" onClick={startCamera}>Scanner avec la caméra</button>
              : <button type="button" className="btn-ghost" onClick={stopCamera}>Arrêter la caméra</button>}
          </div>
          {scanning && <div id="reader" style={{ width: '100%', maxWidth: 360, marginTop: 12, borderRadius: 10, overflow: 'hidden' }} />}
          {camError && <p className="error" style={{ fontSize: '.85rem', marginTop: 10 }}>{camError}</p>}

          <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
            Scanne le QR d'un billet avec la caméra, ou colle son token (visible dans « Mes billets »).
          </p>

          {last && (
            <div className={`scan-result ${RESULT_UI[last.result]?.cls || 'danger'}`}>
              <div className="scan-verdict">{RESULT_UI[last.result]?.label || 'REFUSÉ'}</div>

              {last.title ? (
                <>
                  <div className="scan-event">{last.title}</div>
                  {last.result === 'wrong_event' &&
                    <div className="danger-text" style={{ fontSize: '.85rem', marginBottom: 8 }}>
                      Ce billet n'est pas valable pour l'événement contrôlé.</div>}
                  <dl className="scan-details">
                    {last.category && (<><dt>Catégorie</dt><dd>{last.category}</dd></>)}
                    {last.starts_at && (<><dt>Date de l'événement</dt>
                      <dd>{new Date(last.starts_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</dd></>)}
                    {(last.price !== undefined && last.price !== null) && (<><dt>Tarif</dt>
                      <dd>{Number(last.price) > 0 ? `${Number(last.price).toFixed(2)} €` : 'Gratuit'}</dd></>)}
                    {last.holder && (<><dt>Titulaire</dt><dd>{last.holder}</dd></>)}
                    {last.email && (<><dt>E-mail</dt><dd className="mono">{last.email}</dd></>)}
                    {last.ticket_id && (<><dt>N° de billet</dt><dd className="mono">#{last.ticket_id}</dd></>)}
                    {last.purchased_at && (<><dt>Acheté le</dt>
                      <dd>{new Date(last.purchased_at).toLocaleDateString('fr-FR')}</dd></>)}
                    {last.result === 'duplicate' && last.first_scan && (<><dt>Premier scan</dt>
                      <dd className="danger-text">{new Date(last.first_scan).toLocaleString('fr-FR')}</dd></>)}
                  </dl>
                </>
              ) : (
                <div className="muted" style={{ marginTop: 6 }}>
                  Ce QR ne correspond à aucun billet enregistré.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Suivi des entrées <span className="hint">temps réel</span></h2>
          {eventId && <p className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: '.85rem' }}>
            Événement : <strong>{events.find((e) => String(e.id) === String(eventId))?.title}</strong></p>}
          <div className="kpi-row" style={{ marginBottom: 14 }}>
            <div className="kpi"><span className="kpi-n" style={{ color: 'var(--ok)' }}>{stat('valid')}</span><span className="kpi-l">Validés</span></div>
            <div className="kpi"><span className="kpi-n" style={{ color: 'var(--danger)' }}>{stat('duplicate') + stat('unknown')}</span><span className="kpi-l">Refusés</span></div>
          </div>
          <table className="table">
            <thead><tr><th>Heure</th><th>Événement</th><th>Porte</th><th>Résultat</th></tr></thead>
            <tbody>
              {entries.recent.map((s, i) => (
                <tr key={i}>
                  <td className="mono">{new Date(s.scanned_at).toLocaleTimeString('fr-FR')}</td>
                  <td>{s.event_title || '—'}</td><td>{s.gate}</td>
                  <td><span className="sev" style={{ color: s.result === 'valid' ? 'var(--ok)' : 'var(--danger)' }}>{s.result}</span></td>
                </tr>
              ))}
              {entries.recent.length === 0 && <tr><td colSpan="4" className="muted">Aucun scan pour l'instant.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
