import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';

// Bonus : choix d'un nouveau mot de passe via le jeton reçu par e-mail.
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } });
      setOk(true);
      setTimeout(() => nav('/connexion'), 2500);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="panel">
        <h2>Nouveau mot de passe</h2>
        {!token ? (
          <p className="error">Lien invalide : jeton manquant. Refaites une demande depuis « Mot de passe oublié ».</p>
        ) : ok ? (
          <p className="muted">Mot de passe mis à jour. Redirection vers la connexion…</p>
        ) : (
          <>
            <p className="muted">Choisissez un nouveau mot de passe (au moins 10 caractères, avec majuscule, minuscule et chiffre).</p>
            <form onSubmit={submit}>
              <label className="field">Nouveau mot de passe
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
              <label className="field">Confirmer le mot de passe
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
              {error && <p className="error">{error}</p>}
              <button type="submit">Changer le mot de passe</button>
            </form>
          </>
        )}
        <p className="muted" style={{ marginTop: 16 }}><Link to="/connexion" style={{ color: 'var(--signal)' }}>Retour à la connexion</Link></p>
      </div>
    </div>
  );
}
