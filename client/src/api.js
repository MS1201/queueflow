const BASE = import.meta.env.VITE_API_URL || '';
const AUTH_KEY = 'qf_auth';

export const getAuthToken = () => {
  try { return localStorage.getItem(AUTH_KEY); } catch { return null; }
};
export const setAuthToken = (t) => {
  try { t ? localStorage.setItem(AUTH_KEY, t) : localStorage.removeItem(AUTH_KEY); } catch { /* storage unavailable */ }
};

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && token) {
      setAuthToken(null);
      window.dispatchEvent(new Event('qf:logout'));
    }
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}
