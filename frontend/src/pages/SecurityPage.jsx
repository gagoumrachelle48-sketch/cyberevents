import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

export default function SecurityPage() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState(null);   // { qr, otpauth } pendant la configuration
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (ready && !user) { nav('/connexion'); return; }
    if (user) api('/auth/2fa/status').then((d) => setEnabled(d.enabled)).catch(() => {});
  }, [user, ready]);

  const startSetup = async () => {
    setMsg('');
    try { const d = await api('/auth/2fa/setup', { method: 'POST' }); setSetup(d); }
    catch (e) { setMsg(e.message); }
  };
  const confirmEnable = async () => {
    setMsg('');
    try { await api('/auth/2fa/enable', { method: 'POST', body: { code } });
      setEnabled(true); setSetup(null); setCode(''); setMsg('Double authentification activée.'); }
    catch (e) { setMsg(e.message); }
  };
  const disable = async () => {
    setMsg('');
    try { await api('/auth/2fa/disable', { method: 'POST' }); setEnabled(false); setMsg('Double authentification désactivée.'); }
    catch (e) { setMsg(e.message); }
  };

  return (
    <>
      <div className="panel" style={{ maxWidth: 560 }}>
        <h2>Double authentification (2FA)</h2>
        <p className="muted">
          La double authentification ajoute un code à usage unique, en plus du mot de passe,
          généré par une application comme Google Authenticator ou Microsoft Authenticator.
        </p>

        {msg && <p className="info">{msg}</p>}

        {enabled && !setup && (
          <>
            <p><span className="sev" style={{ color: 'var(--ok)' }}>● Activée</span> — votre compte est protégé.</p>
            <button className="btn-ghost" onClick={disable}>Désactiver</button>
          </>
        )}

        {!enabled && !setup && (
          <>
            <p><span className="sev" style={{ color: 'var(--muted)' }}>● Désactivée</span></p>
            <button onClick={startSetup}>Activer le 2FA</button>
          </>
        )}

        {setup && (
          <div>
            <p>1. Scannez ce QR code dans votre application d'authentification :</p>
            <div className="qr-box"><img src={setup.qr} alt="QR 2FA" width="200" height="200" /></div>
            <p style={{ marginTop: 14 }}>2. Entrez le code à 6 chiffres affiché par l'application :</p>
            <div className="scan-form" style={{ maxWidth: 260 }}>
              <input className="mono" value={code} onChange={(e) => setCode(e.target.value)}
                     inputMode="numeric" maxLength={6} placeholder="123456" />
              <button onClick={confirmEnable}>Confirmer</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
