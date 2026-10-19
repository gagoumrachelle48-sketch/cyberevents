import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// Bonus : demande de réinitialisation du mot de passe (envoi d'un e-mail).
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      const d = await api('/auth/forgot', { method: 'POST', body: { email } });
      setMsg(d.message || "Si un compte existe, un e-mail a été envoyé.");
      setSent(true);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="panel">
        <h2>Mot de passe oublié</h2>
        {!sent ? (
          <>
            <p className="muted">Entrez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
            <form onSubmit={submit}>
              <label className="field">E-mail
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              {error && <p className="error">{error}</p>}
              <button type="submit">Envoyer le lien</button>
            </form>
          </>
        ) : (
          <p className="muted">{msg} Pensez à vérifier votre dossier « Spam ». Le lien est valable 30 minutes.</p>
        )}
        <p className="muted" style={{ marginTop: 16 }}><Link to="/connexion" style={{ color: 'var(--signal)' }}>Retour à la connexion</Link></p>
      </div>
    </div>
  );
}
