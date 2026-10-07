import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await register(form); nav('/'); } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="panel">
        <h2>Créer un compte</h2>
        <form onSubmit={submit}>
          <label className="field">Nom complet
            <input value={form.full_name} onChange={set('full_name')} required /></label>
          <label className="field">E-mail
            <input type="email" value={form.email} onChange={set('email')} required /></label>
          <label className="field">Mot de passe
            <input type="password" value={form.password} onChange={set('password')} required /></label>
          {error && <p className="error">{error}</p>}
          <button type="submit">S'inscrire</button>
        </form>
      </div>
    </div>
  );
}
