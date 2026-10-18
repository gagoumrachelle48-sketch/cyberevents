import { useEffect, useState } from 'react';
import { api } from '../api';

// US-029 : analytics de ventes avec prévision des pics d'achat (persona Lisa, organisatrice).
// Graphiques en SVG pur (aucune dépendance), aux couleurs de l'application.
const AMBER = '#f5a524';
const GREEN = '#35c28b';
const DANGER = '#f06060';
const LINE = '#26324d';
const MUTED = '#8695ad';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const dshort = (s) => new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

// Courbe CA historique + prévision (pics en rouge)
function SalesLine({ daily, forecast }) {
  const hist = daily.map((d) => ({ date: d.date, v: Number(d.revenue), f: false }));
  const fore = forecast.map((d) => ({ date: d.date, v: Number(d.revenue_pred), f: true, peak: d.is_peak }));
  const all = [...hist, ...fore];
  if (all.length < 2) return <p className="muted">Pas encore assez de ventes pour tracer la courbe.</p>;
  const W = 900, H = 260, P = 34;
  const max = Math.max(...all.map((p) => p.v), 1);
  const x = (i) => P + (i * (W - 2 * P)) / (all.length - 1);
  const y = (v) => H - P - (v * (H - 2 * P)) / max;
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.gi).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const histPts = all.map((p, i) => ({ ...p, gi: i })).filter((p) => !p.f);
  const forePts = all.map((p, i) => ({ ...p, gi: i })).filter((p, i) => p.f || i === hist.length - 1);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P} x2={W - P} y1={y(t)} y2={y(t)} stroke={LINE} strokeWidth="1" />
          <text x={4} y={y(t) + 4} fill={MUTED} fontSize="11">{eur.format(t)}</text>
        </g>
      ))}
      <path d={path(histPts)} fill="none" stroke={AMBER} strokeWidth="2.4" />
      <path d={path(forePts)} fill="none" stroke={GREEN} strokeWidth="2.2" strokeDasharray="6 4" />
      {all.map((p, i) => p.f && p.peak ? (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.v)} r="4.5" fill={DANGER} />
          <text x={x(i)} y={y(p.v) - 9} fill={DANGER} fontSize="10" textAnchor="middle">pic</text>
        </g>
      ) : null)}
      {all.map((p, i) => (i % Math.ceil(all.length / 10) === 0 || i === all.length - 1) ? (
        <text key={'x' + i} x={x(i)} y={H - 10} fill={MUTED} fontSize="10" textAnchor="middle">{dshort(p.date)}</text>
      ) : null)}
    </svg>
  );
}

// Barres horizontales : CA par événement
function EventBars({ rows }) {
  if (!rows.length) return <p className="muted">Aucune vente enregistrée.</p>;
  const max = Math.max(...rows.map((r) => Number(r.revenue)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.event_title}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.86rem', marginBottom: 3 }}>
            <span>{r.event_title}</span>
            <span className="mono" style={{ color: MUTED }}>{eur.format(r.revenue)} · {r.tickets} billets</span>
          </div>
          <div style={{ background: '#1c2941', borderRadius: 6, height: 14 }}>
            <div style={{ width: `${(Number(r.revenue) / max) * 100}%`, background: AMBER, height: '100%', borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Barres verticales : billets vendus par heure (pic horaire)
function HourBars({ rows }) {
  const map = {}; rows.forEach((r) => { map[r.hour] = Number(r.tickets); });
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, v: map[h] || 0 }));
  const max = Math.max(...hours.map((x) => x.v), 1);
  const peak = hours.reduce((a, b) => (b.v > a.v ? b : a), hours[0]);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
        {hours.map((x) => (
          <div key={x.h} title={`${x.h}h : ${x.v} billets`}
            style={{ flex: 1, height: `${(x.v / max) * 100}%`, minHeight: 2,
              background: x.h === peak.h ? GREEN : AMBER, borderRadius: '3px 3px 0 0' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTED, fontSize: '.75rem', marginTop: 4 }}>
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: '.85rem' }}>
        Pic d'affluence : <strong style={{ color: GREEN }}>{peak.h}h</strong> ({peak.v} billets).
      </p>
    </>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { api('/admin/analytics').then(setData).catch((e) => setErr(e.message)); }, []);

  if (err) return <p className="muted">Accès réservé à l'organisateur / administrateur. ({err})</p>;
  if (!data) return <p className="muted">Chargement des analytics…</p>;

  const { kpi, by_event, daily, by_hour, forecast, peaks, trend } = data;
  const nextPeaks = forecast.filter((f) => f.is_peak);

  return (
    <>
      <div className="kpi-row">
        <div className="kpi"><span className="kpi-n">{eur.format(kpi.revenue)}</span><span className="kpi-l">Chiffre d'affaires</span></div>
        <div className="kpi"><span className="kpi-n">{kpi.tickets}</span><span className="kpi-l">Billets vendus</span></div>
        <div className="kpi"><span className="kpi-n">{kpi.orders}</span><span className="kpi-l">Commandes</span></div>
        <div className="kpi"><span className="kpi-n">{eur2.format(kpi.avg_basket)}</span><span className="kpi-l">Panier moyen</span></div>
        <div className="kpi"><span className="kpi-n" style={{ color: trend >= 0 ? GREEN : DANGER }}>
          {trend >= 0 ? '▲' : '▼'} {eur.format(Math.abs(trend))}</span><span className="kpi-l">Tendance / jour</span></div>
      </div>

      <div className="panel">
        <h2>Ventes dans le temps & prévision <span className="hint">historique (ambre) · prévision 14 j (vert) · pics prévus (rouge)</span></h2>
        <SalesLine daily={daily} forecast={forecast} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel">
          <h2>Chiffre d'affaires par événement</h2>
          <EventBars rows={by_event} />
        </div>
        <div className="panel">
          <h2>Pics d'achat par heure</h2>
          <HourBars rows={by_hour} />
        </div>
      </div>

      <div className="panel">
        <h2>Prévision des pics d'achat <span className="hint">jours où la demande attendue dépasse le seuil</span></h2>
        {nextPeaks.length ? (
          <table className="table">
            <thead><tr><th>Date prévue</th><th>CA attendu</th><th>Signal</th></tr></thead>
            <tbody>
              {nextPeaks.map((p) => (
                <tr key={p.date}>
                  <td className="mono">{new Date(p.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}</td>
                  <td className="mono">{eur.format(p.revenue_pred)}</td>
                  <td><span style={{ color: DANGER }}>● pic d'achat probable</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Aucun pic marqué sur les 14 prochains jours (demande attendue régulière).</p>}
        {peaks.length > 0 && (
          <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>
            Pics historiques les plus forts : {peaks.map((p) => `${dshort(p.date)} (${eur.format(p.revenue)})`).join(' · ')}.
          </p>
        )}
      </div>
    </>
  );
}
