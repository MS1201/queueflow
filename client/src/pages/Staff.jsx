import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Megaphone, Play, RotateCcw, UserX, UserCheck } from 'lucide-react';
import { api } from '../api.js';
import { useLive, useNow } from '../hooks.js';
import { useAuth, useToast } from '../context.jsx';
import { CrowdMeter, Empty, ErrorNote, PriorityBadge, Spinner, StatusChip } from '../components/ui.jsx';
import { PRIORITY_LABEL, fmtDuration, minutesSince } from '../utils.js';

const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export default function Staff() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState(user.role === 'staff' ? user.service?._id || '' : read('qf_staff_service'));

  useEffect(() => {
    if (user.role !== 'admin') return;
    api('/services').then((d) => {
      setServices(d.services);
      setServiceId((cur) => (d.services.some((s) => s._id === cur) ? cur : d.services[0]?._id || ''));
    }).catch(() => {});
  }, [user.role]);

  if (!serviceId) {
    return (
      <div className="container page">
        <Empty title="No service assigned">{user.role === 'staff' ? 'Ask an administrator to assign you to a service.' : 'Create a service in the admin area first.'}</Empty>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="row between wrap gap page-head">
        <h1 className="h1">Counter desk</h1>
        {user.role === 'admin' && services.length > 0 && (
          <label className="field inline">Service
            <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); write('qf_staff_service', e.target.value); }}>
              {services.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <Console key={serviceId} serviceId={serviceId} />
    </div>
  );
}

function Console({ serviceId }) {
  const toast = useToast();
  const snap = useLive(() => api(`/services/${serviceId}/snapshot`), serviceId, serviceId);
  const queue = useLive(() => api(`/services/${serviceId}/queue`), serviceId, serviceId);
  const [counterId, setCounterId] = useState(read(`qf_counter_${serviceId}`));
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);

  const counters = snap.data?.counters || [];
  const counter = counters.find((c) => c._id === counterId) || counters[0];
  const service = snap.data?.service;
  const active = queue.data?.active.find((t) => String(t.counter) === counter?._id);
  const refresh = () => { snap.reload(); queue.reload(); };

  async function act(path, { method = 'POST', body } = {}) {
    setBusy(true);
    try {
      const res = await api(`/counters/${counter._id}/${path}`, { method, body });
      toast(res.message || 'Updated', res.token === null ? 'info' : 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
      refresh();
    }
  }

  if (snap.loading || queue.loading) return <Spinner label="Loading the counter desk" />;
  if (snap.error && !snap.data) return <ErrorNote error={snap.error} retry={snap.reload} />;
  if (!counter) return <Empty title="This service has no counters">An administrator can add counters in the admin area.</Empty>;

  const calledLeft = active?.status === 'called' ? Math.max(0, (new Date(active.calledAt).getTime() + service.noShowSeconds * 1000 - now) / 1000) : null;
  const servingFor = active?.status === 'serving' ? (now - new Date(active.startedAt).getTime()) / 1000 : null;

  return (
    <div className="staff-grid">
      <section className="stack">
        <div className="card">
          <div className="row between wrap gap">
            <label className="field inline">My counter
              <select value={counter._id} onChange={(e) => { setCounterId(e.target.value); write(`qf_counter_${serviceId}`, e.target.value); }}>
                {counters.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
            <div className="segmented" role="group" aria-label="Counter status">
              {[['open', 'Open'], ['break', 'On break'], ['closed', 'Closed']].map(([value, label]) => (
                <button key={value} className={counter.status === value ? 'on' : ''} disabled={busy || counter.status === value}
                  onClick={() => act('status', { method: 'PATCH', body: { status: value } })}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className={`card console tone-${active ? active.status : 'idle'}`}>
          {active ? (
            <>
              <div className="row between wrap">
                <div>
                  <div className="muted small">At {counter.name}</div>
                  <div className="token-label">{active.label}</div>
                </div>
                <div className="stack-end"><StatusChip status={active.status} /><PriorityBadge priority={active.priority} /></div>
              </div>
              <p className="lead-sm"><strong>{active.name}</strong>{active.phone ? ` · ${active.phone}` : ''}{active.checkedIn ? ' · on premises' : ' · not checked in'}</p>
              {calledLeft !== null && <p className="muted">Called. Auto no-show in <b className="tabular">{fmtDuration(calledLeft)}</b>{active.recallCount ? ` (recalled ${active.recallCount}×)` : ''}</p>}
              {servingFor !== null && <p className="muted">Serving for <b className="tabular">{fmtDuration(servingFor)}</b></p>}
              <div className="row wrap gap actions">
                {active.status === 'called' && <button className="btn btn-primary" disabled={busy} onClick={() => act('start')}><Play size={16} aria-hidden /> Start serving</button>}
                <button className={`btn ${active.status === 'serving' ? 'btn-primary' : 'btn-ghost'}`} disabled={busy} onClick={() => act('complete')}><Check size={16} aria-hidden /> Complete</button>
                {active.status === 'called' && <button className="btn btn-ghost" disabled={busy} onClick={() => act('recall')}><RotateCcw size={16} aria-hidden /> Recall</button>}
                {active.status === 'called' && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => act('no-show')}><UserX size={16} aria-hidden /> No-show</button>}
              </div>
            </>
          ) : (
            <>
              <div className="muted small">At {counter.name}</div>
              <p className="lead-sm">{counter.status === 'open' ? 'Counter is free.' : 'Open the counter to start calling tokens.'}</p>
              <button className="btn btn-primary btn-lg" disabled={busy || counter.status !== 'open'} onClick={() => act('call-next')}>
                <Megaphone size={18} aria-hidden /> Call next token
              </button>
              <p className="muted small">{snap.data.waitingCount} waiting. Emergency, then accessibility and senior tokens are called before standard ones.</p>
            </>
          )}
        </div>

        <div className="card">
          <h2 className="h3">Waiting line ({queue.data.waiting.length})</h2>
          {queue.data.waiting.length === 0 ? <p className="muted">Nobody is waiting.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Token</th><th>Name</th><th>Priority</th><th>Waited</th><th>On site</th></tr></thead>
                <tbody>
                  {queue.data.waiting.map((t, i) => (
                    <tr key={t._id}>
                      <td>{i + 1}</td><td><strong>{t.label}</strong></td><td>{t.name}</td>
                      <td>{t.priority === 'normal' ? <span className="muted">Standard</span> : <PriorityBadge priority={t.priority} />}</td>
                      <td>{minutesSince(t.createdAt)} min</td>
                      <td>{t.checkedIn ? <UserCheck size={16} aria-label="Checked in" /> : <span className="muted">no</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <aside className="stack">
        <WalkIn serviceId={serviceId} onDone={refresh} />
        <Gate serviceId={serviceId} crowd={snap.data.crowd} onDone={refresh} />
        <div className="card">
          <h2 className="h3">All counters</h2>
          <ul className="plain-list">
            {counters.map((c) => (
              <li key={c._id}>
                <span>{c.name} <span className={`pip pip-${c.status}`}>{c.status === 'break' ? 'break' : c.status}</span></span>
                <strong>{c.current?.label || '·'}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="h3">Recently finished</h2>
          {queue.data.recent.length === 0 ? <p className="muted">Nothing yet today.</p> : (
            <ul className="plain-list">
              {queue.data.recent.map((t) => <li key={t._id}><span>{t.label} · {t.name}</span><StatusChip status={t.status} /></li>)}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function WalkIn({ serviceId, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', priority: 'normal' });
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/tokens', { method: 'POST', body: { serviceId, walkIn: true, ...form } });
      setIssued(res.token);
      toast(`Issued ${res.token.label}`);
      setForm({ name: '', phone: '', priority: 'normal' });
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2 className="h3">Issue a walk-in token</h2>
      <label className="field">Name<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="field">Phone <span className="muted">(optional)</span><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      <label className="field">Priority
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Issuing…' : 'Issue token'}</button>
      {issued && (
        <div className="issued">
          <QRCodeSVG value={`${window.location.origin}/track/${issued.code}`} size={84} marginSize={1} />
          <div><div className="token-label sm">{issued.label}</div><div className="muted small">Position {issued.position} · code {issued.code}</div></div>
        </div>
      )}
    </form>
  );
}

function Gate({ serviceId, crowd, onDone }) {
  const toast = useToast();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(kind) {
    if (!ref.trim()) return toast('Enter a token code or number such as H-012.', 'error');
    setBusy(true);
    try {
      const res = await api(`/crowd/${kind}`, { method: 'POST', body: { serviceId, ref } });
      toast(`${res.label} ${kind === 'check-in' ? 'checked in' : 'checked out'}`);
      setRef('');
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form">
      <h2 className="h3">Entrance desk</h2>
      <CrowdMeter crowd={crowd} />
      <label className="field">Token code, number, or tracking link
        <input value={ref} placeholder="H-012 or 3FA9C1B20D" onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go('check-in')} />
      </label>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy} onClick={() => go('check-in')}>Check in</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => go('check-out')}>Check out</button>
      </div>
    </div>
  );
}
