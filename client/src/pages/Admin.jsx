import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useLive } from '../hooks.js';
import { useToast } from '../context.jsx';
import { Bars, CrowdMeter, Empty, ErrorNote, Spinner, Stat } from '../components/ui.jsx';
import { CATEGORY_LABEL } from '../utils.js';

const TABS = [['overview', 'Overview'], ['services', 'Services and counters'], ['crowd', 'Crowd'], ['staff', 'Staff accounts']];

export default function Admin() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="container page">
      <h1 className="h1">Administration</h1>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'services' && <Services />}
      {tab === 'crowd' && <CrowdTab />}
      {tab === 'staff' && <StaffTab />}
    </div>
  );
}

function Overview() {
  const { data, error, loading, reload } = useLive(() => api('/admin/overview'), null, 'overview');
  if (loading) return <Spinner />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  const { totals, services, hourly } = data;
  const active = hourly.filter((h) => h.count > 0);
  const from = active.length ? Math.max(0, active[0].hour - 1) : 6;
  const to = active.length ? Math.min(23, active[active.length - 1].hour + 1) : 20;
  const shown = hourly.filter((h) => h.hour >= from && h.hour <= to);
  return (
    <div className="stack">
      <div className="stats-row">
        <Stat label="Tokens issued today" value={totals.issued} />
        <Stat label="Waiting now" value={totals.waiting} />
        <Stat label="Completed" value={totals.completed} />
        <Stat label="No-shows" value={totals.noShow} />
        <Stat label="Average wait" value={`${totals.avgWaitMinutes} min`} />
      </div>
      <div className="card">
        <h2 className="h3">Tokens issued by hour</h2>
        <Bars data={shown.map((h) => ({ label: `${h.hour}:00`, value: h.count }))} names={['Tokens']} labelEvery={2} />
      </div>
      <div className="card">
        <h2 className="h3">By service</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Service</th><th>Issued</th><th>Waiting</th><th>Completed</th><th>No-show</th><th>Avg wait</th><th>Waiting room</th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s._id}>
                  <td><strong>{s.name}</strong> {!s.active && <span className="muted">(inactive)</span>}</td>
                  <td>{s.issued}</td><td>{s.waiting}</td><td>{s.completed}</td><td>{s.noShow}</td><td>{s.avgWaitMinutes} min</td>
                  <td className="cell-meter"><CrowdMeter crowd={s.crowd} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const BLANK = { name: '', code: '', category: 'other', address: '', avgServiceMinutes: 8, capacity: 50, noShowSeconds: 120, tokenExpiryMinutes: 240 };

function ServiceForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const [f, setF] = useState({ ...BLANK, ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (k, label, min, max) => (
    <label className="field">{label}<input type="number" min={min} max={max} required value={f[k]} onChange={set(k)} /></label>
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, avgServiceMinutes: +f.avgServiceMinutes, capacity: +f.capacity, noShowSeconds: +f.noShowSeconds, tokenExpiryMinutes: +f.tokenExpiryMinutes };
      if (initial?._id) await api(`/services/${initial._id}`, { method: 'PUT', body });
      else await api('/services', { method: 'POST', body });
      toast(initial?._id ? 'Service updated' : 'Service created');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2 className="h3">{initial?._id ? 'Edit service' : 'New service'}</h2>
      <div className="form-grid">
        <label className="field">Name<input required maxLength={80} value={f.name} onChange={set('name')} /></label>
        <label className="field">Token prefix <span className="muted">(1-3 letters)</span><input required maxLength={3} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></label>
        <label className="field">Type
          <select value={f.category} onChange={set('category')}>{Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field">Address<input maxLength={160} value={f.address} onChange={set('address')} /></label>
        {num('avgServiceMinutes', 'Typical service time (min)', 1, 240)}
        {num('capacity', 'Waiting room capacity', 1, 10000)}
        {num('noShowSeconds', 'No-show grace period (seconds)', 15, 3600)}
        {num('tokenExpiryMinutes', 'Waiting token expiry (min)', 10, 1440)}
      </div>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save service'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Services() {
  const toast = useToast();
  const { data, error, loading, reload } = useLive(() => api('/services?all=1'), null, 'admin-services');
  const [editing, setEditing] = useState(null); // null | 'new' | service
  const [counterName, setCounterName] = useState({});

  async function run(fn, ok) {
    try { await fn(); if (ok) toast(ok); } catch (err) { toast(err.message, 'error'); } finally { reload(); }
  }

  if (loading) return <Spinner />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;

  return (
    <div className="stack">
      <div><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> New service</button></div>
      {editing && (
        <ServiceForm key={editing === 'new' ? 'new' : editing._id} initial={editing === 'new' ? null : editing}
          onSaved={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
      )}
      {data.services.length === 0 && <Empty title="No services yet">Create your first service to start taking tokens.</Empty>}
      {data.services.map((s) => (
        <div className="card" key={s._id}>
          <div className="row between wrap gap">
            <div>
              <h2 className="h3">{s.name} <span className="muted">({s.code})</span> {!s.active && <span className="chip">Inactive</span>}</h2>
              <p className="muted small">{CATEGORY_LABEL[s.category]} · {s.address || 'No address'} · {s.avgServiceMinutes} min per customer · capacity {s.capacity} · no-show after {s.noShowSeconds}s</p>
            </div>
            <div className="row gap wrap">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/services/${s._id}`, { method: 'PUT', body: { active: !s.active } }), s.active ? 'Service deactivated' : 'Service activated')}>{s.active ? 'Deactivate' : 'Activate'}</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => window.confirm(`Delete ${s.name} with all its counters and tokens? This cannot be undone.`) && run(() => api(`/services/${s._id}`, { method: 'DELETE' }), 'Service deleted')}>Delete</button>
            </div>
          </div>
          <div className="counter-list">
            {s.counters.map((c) => (
              <span key={c._id} className="counter-chip">
                <i className={`pip-dot pip-${c.status}`} aria-hidden /> {c.name}
                <button aria-label={`Remove ${c.name}`} title="Remove counter" onClick={() => run(() => api(`/counters/${c._id}`, { method: 'DELETE' }), 'Counter removed')}><Trash2 size={13} /></button>
              </span>
            ))}
            {s.counters.length === 0 && <span className="muted small">No counters yet.</span>}
          </div>
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault();
            const name = (counterName[s._id] || '').trim();
            if (!name) return;
            run(() => api(`/services/${s._id}/counters`, { method: 'POST', body: { name } }), 'Counter added').then(() => setCounterName({ ...counterName, [s._id]: '' }));
          }}>
            <input aria-label={`New counter name for ${s.name}`} placeholder="Add a counter, e.g. Desk 4" value={counterName[s._id] || ''} onChange={(e) => setCounterName({ ...counterName, [s._id]: e.target.value })} />
            <button className="btn btn-ghost btn-sm">Add counter</button>
          </form>
        </div>
      ))}
    </div>
  );
}

function CrowdTab() {
  const list = useLive(() => api('/services?all=1'), null, 'crowd-list');
  const [sel, setSel] = useState('');
  const id = sel || list.data?.services[0]?._id || '';
  const crowd = useLive(() => (id ? api(`/services/${id}/crowd`) : Promise.resolve(null)), id || null, id || 'none');
  if (list.loading) return <Spinner />;
  if (!list.data?.services.length) return <Empty title="No services yet" />;
  const data = crowd.data;
  return (
    <div className="stack">
      <label className="field inline">Service
        <select value={id} onChange={(e) => setSel(e.target.value)}>{list.data.services.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
      </label>
      {!data ? <Spinner /> : (
        <>
          <div className="card"><h2 className="h3">Waiting room right now</h2><CrowdMeter crowd={data.crowd} /></div>
          <div className="card">
            <h2 className="h3">Entries and exits, last 12 hours</h2>
            <Bars
              names={['Check-ins', 'Check-outs']}
              data={data.history.map((h) => ({ label: new Date(h.hour).toLocaleTimeString([], { hour: 'numeric' }), value: h.checkIns, value2: h.checkOuts }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function StaffTab() {
  const toast = useToast();
  const users = useLive(() => api('/admin/users'), null, 'users');
  const services = useLive(() => api('/services?all=1'), null, 'users-services');
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff', service: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/users', { method: 'POST', body: { ...f, service: f.service || services.data?.services[0]?._id } });
      toast('Account created');
      setF({ name: '', email: '', password: '', role: 'staff', service: '' });
      users.reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(u) {
    if (!window.confirm(`Delete the account for ${u.name}?`)) return;
    try { await api(`/admin/users/${u._id}`, { method: 'DELETE' }); toast('Account deleted'); } catch (err) { toast(err.message, 'error'); } finally { users.reload(); }
  }

  return (
    <div className="two-col even">
      <form className="card form" onSubmit={submit}>
        <h2 className="h3">Add an account</h2>
        <label className="field">Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="field">Temporary password <span className="muted">(8+ characters)</span><input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label className="field">Role
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Counter staff</option><option value="admin">Administrator</option></select>
        </label>
        {f.role === 'staff' && (
          <label className="field">Assigned service
            <select value={f.service || services.data?.services[0]?._id || ''} onChange={(e) => setF({ ...f, service: e.target.value })}>
              {services.data?.services.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <div className="card">
        <h2 className="h3">Accounts</h2>
        {users.loading ? <Spinner /> : (
          <ul className="plain-list">
            {users.data?.users.map((u) => (
              <li key={u._id}>
                <span><strong>{u.name}</strong><br /><span className="muted small">{u.email} · {u.role === 'admin' ? 'Administrator' : u.service?.name || 'Unassigned'}</span></span>
                <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(u)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
