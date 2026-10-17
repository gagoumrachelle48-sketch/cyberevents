import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  // Connexion : renvoie la réponse brute. Si 2FA activé, { need2fa, challenge } sans jeton.
  const login = async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (d.need2fa) return d;              // étape 2FA à compléter côté page
    setToken(d.token); setUser(d.user);
    return d;
  };
  // Étape 2FA : vérifier le code pour finir la connexion
  const complete2fa = async (challenge, code) => {
    const d = await api('/auth/2fa/verify', { method: 'POST', body: { challenge, code } });
    setToken(d.token); setUser(d.user);
    return d.user;
  };
  const register = async (payload) => {
    const d = await api('/auth/register', { method: 'POST', body: payload });
    setToken(d.token); setUser(d.user); return d.user;
  };
  const logout = () => { setToken(null); setUser(null); };

  return <Ctx.Provider value={{ user, ready, login, complete2fa, register, logout }}>{children}</Ctx.Provider>;
}
