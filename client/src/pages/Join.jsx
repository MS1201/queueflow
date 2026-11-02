import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useLive } from '../hooks.js';
import { CrowdMeter, ErrorNote, Spinner } from '../components/ui.jsx';
import { CATEGORY_LABEL, fmtWait, saveMyToken } from '../utils.js';

const OPTIONS = [
  ['normal', 'Standard', 'First come, first served.'],
  ['senior', 'Senior citizen', 'Aged 60 or above. Bring an ID to the counter.'],
  ['accessibility', 'Accessibility', 'Mobility, vision, hearing or other needs. Staff may confirm at the counter.'],
];

export default function Join() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLive(() => api(`/services/${id}`), id, id);
  const [form, setForm] = useState({ name: '', phone: '', priority: 'normal' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const service = data?.service;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const res = await api('/tokens', { method: 'POST', body: { serviceId: id, ...form } });
      saveMyToken({ code: res.token.code, label: res.token.label, serviceName: res.service.name });
      navigate(`/track/${res.token.code}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data.code) {
        navigate(`/track/${err.data.code}`);
        return;
      }
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="container page"><Spinner /></div>;
  if (error || !service) return <div className="container page"><ErrorNote error={error || { message: 'Service not found.' }} retry={reload} /><Link to="/">Back to services</Link></div>;

  return (
    <div className="container page two-col">
      <form className="card form" onSubmit={submit}>
        <h1 className="h1">Join the queue</h1>
        <p className="muted">You will get a token with a QR code and live updates. No account needed.</p>
        {formError && <div className="alert alert-error" role="alert">{formError}</div>}
        <label className="field">Full name
          <input required minLength={2} maxLength={60} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">Mobile number <span className="muted">(optional, prevents duplicate tokens)</span>
          <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <fieldset className="field">
          <legend>Priority</legend>
          <div className="options">
            {OPTIONS.map(([value, label, hint]) => (
              <label key={value} className={`option ${form.priority === value ? 'selected' : ''}`}>
                <input type="radio" name="priority" value={value} checked={form.priority === value} onChange={() => setForm({ ...form, priority: value })} />
                <span><strong>{label}</strong><small>{hint}</small></span>
              </label>
            ))}
          </div>
          <small className="muted">Emergencies are registered by staff at the counter.</small>
        </fieldset>
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Getting your token…' : 'Get my token'}</button>
      </form>

      <aside className="card side">
        <div className="muted small">{CATEGORY_LABEL[service.category]}</div>
        <h2 className="h2">{service.name}</h2>
        <p className="muted">{service.address}</p>
        <dl className="mini-stats stacked">
          <div><dt>People waiting</dt><dd>{service.waitingCount}</dd></div>
          <div><dt>Estimated wait for you</dt><dd>{fmtWait(service.estimatedWait)}</dd></div>
          <div><dt>Counters open</dt><dd>{service.openCounters} of {service.counters.length}</dd></div>
        </dl>
        <CrowdMeter crowd={service.crowd} />
        {service.openCounters === 0 && <p className="small warn-text">No counters are open. Your token will be kept and called once one opens.</p>}
      </aside>
    </div>
  );
}
