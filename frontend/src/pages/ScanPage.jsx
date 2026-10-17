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
  const scannerRef = useRef(null);

  const load = () => api('/qr/entries').then(setEntries).catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, []);
  // Arrêter la caméra si on quitte la page
  useEffect(() => () => { stopCamera(); }, []);

  // Envoie un token au serveur (depuis la saisie ou la caméra)
  const doScan = async (value) => {
    const t = (value || '').trim();
    if (!t) return;
    try {
      const r = await api('/qr/scan', { method: 'POST', body: { token: t, gate: 'A', controller: 'poste-1' } });
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
              {last.title && <div>{last.title}</div>}
              {last.holder && <div className="muted">{last.holder}</div>}
              {last.result === 'duplicate' && last.first_scan &&
                <div className="muted" style={{ fontSize: '.8rem' }}>
                  Premier scan : {new Date(last.first_scan).toLocaleString('fr-FR')}</div>}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Suivi des entrées <span className="hint">temps réel</span></h2>
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
