import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await login(email, password); nav('/'); } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="panel">
        <h2>Connexion</h2>
        <form onSubmit={submit}>
          <label className="field">E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field">Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Se connecter</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>Pas de compte ? <Link to="/inscription" style={{ color: 'var(--signal)' }}>Créer un compte</Link></p>
      </div>
    </div>
  );
}
