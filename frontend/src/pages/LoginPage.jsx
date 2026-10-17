import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function LoginPage() {
  const { login, complete2fa } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState(null);   // défini si le 2FA est demandé
  const [method, setMethod] = useState('app');        // 'app' ou 'sms'
  const [hint, setHint] = useState('');               // numéro masqué pour le SMS
  const [code, setCode] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const d = await login(email, password);
      if (d.need2fa) { setChallenge(d.challenge); setMethod(d.method || 'app'); setHint(d.hint || ''); return; }
      nav('/');
    } catch (err) { setError(err.message); }
  };

  const submitCode = async (e) => {
    e.preventDefault(); setError('');
    try { await complete2fa(challenge, code); nav('/'); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="panel">
        {!challenge ? (
          <>
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
          </>
        ) : (
          <>
            <h2>Vérification en deux étapes</h2>
            <p className="muted">{method === 'sms'
              ? `Entrez le code à 6 chiffres envoyé par SMS au ${hint || 'votre téléphone'}.`
              : "Entrez le code à 6 chiffres affiché dans votre application d'authentification."}</p>
            <form onSubmit={submitCode}>
              <label className="field">Code
                <input className="mono" value={code} onChange={(e) => setCode(e.target.value)}
                       inputMode="numeric" maxLength={6} placeholder="123456" autoFocus required /></label>
              {error && <p className="error">{error}</p>}
              <button type="submit">Valider</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
