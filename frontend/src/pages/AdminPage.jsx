import { useEffect, useState } from 'react';
import { api } from '../api';

const empty = { title: '', description: '', category: '', starts_at: '', price: 0, reduced_price: '', capacity: 0 };

export default function AdminPage() {
  const [tab, setTab] = useState('events');
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [tx, setTx] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');

  const loadEvents = () => api('/events').then(setEvents).catch(() => {});
  useEffect(() => { loadEvents(); }, []);
  useEffect(() => {
    setMsg('');
    if (tab === 'users') api('/admin/users').then(setUsers).catch((e) => setMsg(e.message));
    if (tab === 'tx') api('/admin/transactions').then(setTx).catch((e) => setMsg(e.message));
  }, [tab]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { ...form, price: Number(form.price), capacity: Number(form.capacity),
        reduced_price: form.reduced_price === '' ? null : Number(form.reduced_price) };
      if (editId) await api(`/admin/events/${editId}`, { method: 'PUT', body });
      else await api('/admin/events', { method: 'POST', body });
      setForm(empty); setEditId(null); loadEvents(); setMsg('Enregistré.');
    } catch (e) { setMsg(e.message); }
  };
  const edit = (ev) => { setEditId(ev.id); setForm({ ...ev, starts_at: ev.starts_at.slice(0, 16), reduced_price: ev.reduced_price ?? '' }); };
  const del = async (id) => { if (confirm('Supprimer cet événement ?')) { await api(`/admin/events/${id}`, { method: 'DELETE' }); loadEvents(); } };

  const hasPw = users[0] && 'password' in users[0];

  return (
    <>
      <div className="tabs">
        <button className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>Événements</button>
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Utilisateurs</button>
        <button className={tab === 'tx' ? 'on' : ''} onClick={() => setTab('tx')}>Transactions</button>
      </div>
      {msg && <p className="info">{msg}</p>}

      {tab === 'events' && (
        <div className="admin-grid">
          <div className="panel admin-form">
            <h2>{editId ? 'Modifier' : 'Nouvel événement'}</h2>
            <label className="field">Titre <input value={form.title} onChange={set('title')} /></label>
            <label className="field">Catégorie <input value={form.category} onChange={set('category')} /></label>
            <label className="field">Description <textarea value={form.description} onChange={set('description')} /></label>
            <label className="field">Date <input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} /></label>
            <label className="field">Prix (€) <input type="number" value={form.price} onChange={set('price')} /></label>
            <label className="field">Prix réduit (€) <input type="number" value={form.reduced_price} onChange={set('reduced_price')} /></label>
            <label className="field">Capacité <input type="number" value={form.capacity} onChange={set('capacity')} /></label>
            <button onClick={save}>{editId ? 'Mettre à jour' : 'Créer'}</button>
            {editId && <button className="btn-ghost" onClick={() => { setForm(empty); setEditId(null); }}>Annuler</button>}
          </div>
          <div className="panel">
            <table className="table">
              <thead><tr><th>Titre</th><th>Prix</th><th>Places</th><th></th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.title}</td><td>{e.price} €</td><td>{e.capacity}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="link" onClick={() => edit(e)}>éditer</button>{' · '}
                      <button className="link" style={{ color: 'var(--danger)' }} onClick={() => del(e.id)}>suppr.</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="panel">
          <table className="table">
            <thead><tr><th>ID</th><th>E-mail</th><th>Nom</th><th>Rôle</th>{hasPw && <th>Mot de passe</th>}</tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.id}</td><td>{u.email}</td><td>{u.full_name}</td>
                  <td><code>{u.role}</code></td>
                  {hasPw && <td className="leak mono">{u.password}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tx' && (
        <div className="panel">
          <table className="table">
            <thead><tr><th>Date</th><th>Client</th><th>Événement</th><th>Montant</th><th>Statut</th><th>IP</th></tr></thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{new Date(t.created_at).toLocaleString('fr-FR')}</td>
                  <td>{t.email}</td><td>{t.event_title}</td><td>{t.amount} €</td>
                  <td><code>{t.status}</code></td><td className="mono">{t.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
