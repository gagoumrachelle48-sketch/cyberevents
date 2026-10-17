import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

export default function SecurityPage() {
  const { user, ready } = useAuth();
  const nav = useNavigate();

  // 2FA par application (TOTP)
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState(null);   // { qr, otpauth } pendant la configuration
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  // 2FA par SMS
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phone, setPhone] = useState('');
  const [smsSent, setSmsSent] = useState(false);   // code envoyé, en attente de confirmation
  const [smsCode, setSmsCode] = useState('');
  const [smsMsg, setSmsMsg] = useState('');

  const refresh = () => api('/auth/2fa/status').then((d) => {
    setEnabled(d.enabled); setSmsEnabled(d.smsEnabled); if (d.phone) setPhone(d.phone);
  }).catch(() => {});

  useEffect(() => {
    if (ready && !user) { nav('/connexion'); return; }
    if (user) refresh();
  }, [user, ready]);

  // --- application ---
  const startSetup = async () => {
    setMsg('');
    try { const d = await api('/auth/2fa/setup', { method: 'POST' }); setSetup(d); }
    catch (e) { setMsg(e.message); }
  };
  const confirmEnable = async () => {
    setMsg('');
    try { await api('/auth/2fa/enable', { method: 'POST', body: { code } });
      setEnabled(true); setSetup(null); setCode(''); setMsg('Double authentification par application activée.'); }
    catch (e) { setMsg(e.message); }
  };
  const disable = async () => {
    setMsg('');
    try { await api('/auth/2fa/disable', { method: 'POST' }); setEnabled(false); setMsg('2FA par application désactivée.'); }
    catch (e) { setMsg(e.message); }
  };

  // --- SMS ---
  const sendSmsCode = async () => {
    setSmsMsg('');
    try { const d = await api('/auth/2fa/sms/setup', { method: 'POST', body: { phone } });
      setSmsSent(true); setSmsMsg(`Code envoyé au ${d.hint}.`); }
    catch (e) { setSmsMsg(e.message); }
  };
  const confirmSms = async () => {
    setSmsMsg('');
    try { await api('/auth/2fa/sms/enable', { method: 'POST', body: { code: smsCode } });
      setSmsEnabled(true); setSmsSent(false); setSmsCode(''); setSmsMsg('Double authentification par SMS activée.'); }
    catch (e) { setSmsMsg(e.message); }
  };
  const disableSms = async () => {
    setSmsMsg('');
    try { await api('/auth/2fa/sms/disable', { method: 'POST' }); setSmsEnabled(false); setSmsMsg('2FA par SMS désactivée.'); }
    catch (e) { setSmsMsg(e.message); }
  };

  return (
    <>
      {/* ---------- 2FA par application ---------- */}
      <div className="panel" style={{ maxWidth: 560 }}>
        <h2>2FA par application (recommandé)</h2>
        <p className="muted">
          Un code à usage unique généré par une application comme Google Authenticator.
          Méthode la plus sûre.
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
            <button onClick={startSetup}>Activer le 2FA par application</button>
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

      {/* ---------- 2FA par SMS ---------- */}
      <div className="panel" style={{ maxWidth: 560, marginTop: 18 }}>
        <h2>2FA par SMS</h2>
        <p className="muted">
          Un code à usage unique envoyé par SMS sur votre téléphone. Plus simple,
          mais un peu moins sûr que l'application (vulnérable au « SIM-swapping »).
        </p>

        {smsMsg && <p className="info">{smsMsg}</p>}

        {smsEnabled && (
          <>
            <p><span className="sev" style={{ color: 'var(--ok)' }}>● Activée</span> — codes envoyés au {phone}.</p>
            <button className="btn-ghost" onClick={disableSms}>Désactiver</button>
          </>
        )}

        {!smsEnabled && !smsSent && (
          <>
            <p><span className="sev" style={{ color: 'var(--muted)' }}>● Désactivée</span></p>
            <p style={{ marginTop: 10 }}>1. Entrez votre numéro (format international) :</p>
            <div className="scan-form" style={{ maxWidth: 320 }}>
              <input className="mono" value={phone} onChange={(e) => setPhone(e.target.value)}
                     placeholder="+33612345678" />
              <button onClick={sendSmsCode}>Recevoir un code</button>
            </div>
          </>
        )}

        {!smsEnabled && smsSent && (
          <>
            <p>2. Entrez le code à 6 chiffres reçu par SMS :</p>
            <div className="scan-form" style={{ maxWidth: 260 }}>
              <input className="mono" value={smsCode} onChange={(e) => setSmsCode(e.target.value)}
                     inputMode="numeric" maxLength={6} placeholder="123456" />
              <button onClick={confirmSms}>Activer</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
