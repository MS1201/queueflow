import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.email, form.password);
      navigate(location.state?.from || (user.role === 'admin' ? '/admin' : '/staff'), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page narrow">
      <h1 className="h1">Staff sign in</h1>
      <p className="muted">For counter staff and administrators. Customers do not need an account.</p>
      <form className="card form" onSubmit={submit}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <label className="field">Email
          <input type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">Password
          <input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <details className="demo">
        <summary>Demo accounts (after running the seed script)</summary>
        <p><code>admin@queueflow.com</code> / <code>Admin@123</code></p>
        <p><code>hospital@queueflow.com</code> / <code>Staff@123</code></p>
      </details>
    </div>
  );
}
