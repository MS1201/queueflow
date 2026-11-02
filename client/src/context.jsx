import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getAuthToken, setAuthToken } from './api.js';

/* ---------- Auth ---------- */
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) { setReady(true); return; }
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setAuthToken(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('qf:logout', onLogout);
    return () => window.removeEventListener('qf:logout', onLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setAuthToken(d.token);
    setUser(d.user);
    return d.user;
  }, []);
  const logout = useCallback(() => { setAuthToken(null); setUser(null); }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);
  const push = useCallback((message, tone = 'ok') => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
