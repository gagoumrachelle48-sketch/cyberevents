import { useEffect, useState } from 'react';
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

  const load = () => api('/qr/entries').then(setEntries).catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, []);

  const scan = async (e) => {
    e?.preventDefault();
    if (!token.trim()) return;
    try {
      const r = await api('/qr/scan', { method: 'POST', body: { token: token.trim(), gate: 'A', controller: 'poste-1' } });
      setLast(r); setToken(''); load();
    } catch (err) { setLast({ result: 'unknown' }); }
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
          <p className="muted" style={{ fontSize: '.82rem' }}>
            En conditions réelles, une caméra lirait le QR. Ici, collez le token du billet
            (visible dans « Mes billets ») pour simuler le scan.
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
