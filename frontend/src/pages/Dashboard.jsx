import { useEffect, useState } from 'react';
import { api } from '../api';

const SEV = { critical: 'var(--danger)', high: 'var(--danger)', medium: 'var(--signal)', low: 'var(--muted)' };
const LABEL = { sqli: 'Injection SQL', xss: 'XSS', bruteforce: 'Brute force', fraud: 'Fraude', qr_fraud: 'Fraude QR' };

export default function Dashboard() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState([]);
  const [metrics, setMetrics] = useState(null);

  const load = () => {
    api('/alerts').then(setAlerts).catch(() => {});
    api('/alerts/stats').then(setStats).catch(() => {});
    api('/metrics').then(setMetrics).catch(() => {});
  };
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  const total = stats.reduce((s, r) => s + r.n, 0);

  return (
    <>
      <div className="kpi-row">
        <div className="kpi"><span className="kpi-n">{total}</span><span className="kpi-l">Alertes totales</span></div>
        {stats.map((s) => (
          <div className="kpi" key={s.type}>
            <span className="kpi-n" style={{ color: SEV[s.type === 'bruteforce' ? 'high' : s.type === 'sqli' ? 'high' : 'medium'] }}>{s.n}</span>
            <span className="kpi-l">{LABEL[s.type] || s.type}</span>
          </div>
        ))}
        {metrics && (
          <div className="kpi"><span className="kpi-n" style={{ color: metrics.db_up ? 'var(--ok)' : 'var(--danger)' }}>
            {metrics.db_up ? 'UP' : 'DOWN'}</span><span className="kpi-l">Base · {metrics.db_latency_ms} ms</span></div>
        )}
      </div>

      <div className="panel">
        <h2>Flux d'alertes <span className="hint">temps réel · rafraîchissement 5 s</span></h2>
        <table className="table">
          <thead><tr><th>Heure</th><th>Type</th><th>Gravité</th><th>Source (IP)</th><th>Détail</th></tr></thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td className="mono">{new Date(a.created_at).toLocaleTimeString('fr-FR')}</td>
                <td>{LABEL[a.type] || a.type}</td>
                <td><span className="sev" style={{ color: SEV[a.severity] }}>● {a.severity}</span></td>
                <td className="mono">{a.ip}</td>
                <td className="mono" style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {a.details ? JSON.stringify(a.details).slice(0, 80) : ''}</td>
              </tr>
            ))}
            {alerts.length === 0 && <tr><td colSpan="5" className="muted">Aucune alerte. Lancez une attaque depuis Kali pour la voir apparaître ici.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
