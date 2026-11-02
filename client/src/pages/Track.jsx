import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { BellRing, DoorOpen, LogIn, MapPin } from 'lucide-react';
import { api } from '../api.js';
import { useLive, useNow } from '../hooks.js';
import { useToast } from '../context.jsx';
import { CrowdMeter, ErrorNote, PriorityBadge, Spinner, StatusChip } from '../components/ui.jsx';
import { fmtDuration, fmtWait, playChime, removeMyToken, saveMyToken } from '../utils.js';

export default function Track() {
  const { code } = useParams();
  const toast = useToast();
  const [serviceId, setServiceId] = useState(null);
  const { data, error, loading, reload } = useLive(() => api(`/tokens/${code}`), serviceId, code);
  const snap = useLive(() => (serviceId ? api(`/services/${serviceId}/snapshot`) : Promise.resolve(null)), serviceId, serviceId || 'none');
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const lastStatus = useRef(null);

  const token = data?.token;
  const service = data?.service;

  useEffect(() => {
    if (service?._id) setServiceId(service._id);
    if (token) saveMyToken({ code: token.code, label: token.label, serviceName: service.name });
  }, [token?.code, service?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alert the person the moment their token is called.
  useEffect(() => {
    if (!token) return;
    if (lastStatus.current && lastStatus.current !== 'called' && token.status === 'called') {
      playChime();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`${token.label} is being called`, { body: `Please go to ${token.counter || 'the counter'}.` });
      }
    }
    lastStatus.current = token.status;
  }, [token?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (error?.status === 404) removeMyToken(code); }, [error, code]);

  async function action(path, okMessage) {
    setBusy(true);
    try {
      await api(`/tokens/${code}/${path}`, { method: 'POST' });
      if (okMessage) toast(okMessage);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function enableAlerts() {
    if (!('Notification' in window)) return toast('This browser does not support notifications.', 'error');
    const result = await Notification.requestPermission();
    toast(result === 'granted' ? 'Alerts are on for this device.' : 'Alerts were not enabled.', result === 'granted' ? 'ok' : 'error');
  }

  if (loading) return <div className="container page"><Spinner label="Finding your token" /></div>;
  if (error || !token) {
    return (
      <div className="container page narrow">
        <ErrorNote error={error || { message: 'Token not found.' }} retry={error?.status === 404 ? undefined : reload} />
        <Link to="/" className="btn btn-ghost">Back to services</Link>
      </div>
    );
  }

  const live = ['waiting', 'called', 'serving'].includes(token.status);
  const remaining = token.noShowDeadline ? Math.max(0, (new Date(token.noShowDeadline).getTime() - now) / 1000) : 0;
  const trackUrl = `${window.location.origin}/track/${token.code}`;
  const serving = snap.data?.counters.filter((c) => c.current && ['called', 'serving'].includes(c.current.status)) || [];

  return (
    <div className="container page two-col">
      <section className="stack">
        <div className={`card token-card tone-${token.status}`}>
          <div className="row between wrap">
            <div>
              <div className="muted small">{service.name}</div>
              <div className="token-label">{token.label}</div>
            </div>
            <div className="stack-end"><StatusChip status={token.status} /><PriorityBadge priority={token.priority} /></div>
          </div>

          {token.status === 'waiting' && (
            <div className="position-grid">
              <div><div className="big">{token.position}</div><div className="muted">Your place in line</div></div>
              <div><div className="big sm">{token.ahead}</div><div className="muted">{token.ahead === 1 ? 'person' : 'people'} ahead</div></div>
              <div><div className="big sm">{fmtWait(token.estimatedWait).replace('about ', '~')}</div><div className="muted">Estimated wait</div></div>
            </div>
          )}

          {token.status === 'called' && (
            <div className="callout">
              <BellRing size={22} aria-hidden />
              <div>
                <strong>It is your turn. Please go to {token.counter || 'the counter'}.</strong>
                <div>Your token expires in <b className="tabular">{fmtDuration(remaining)}</b> if you do not arrive.</div>
              </div>
            </div>
          )}
          {token.status === 'serving' && <p className="lead-sm">You are being served at <strong>{token.counter}</strong>.</p>}
          {token.status === 'completed' && <p className="lead-sm">All done. Thank you for using QueueFlow.</p>}
          {token.status === 'no_show' && <p className="lead-sm">You were called but did not arrive in time, so this token was released. <Link to={`/join/${service._id}`}>Get a new token</Link>.</p>}
          {token.status === 'expired' && <p className="lead-sm">This token expired. <Link to={`/join/${service._id}`}>Get a new token</Link>.</p>}
          {token.status === 'cancelled' && <p className="lead-sm">You cancelled this token. <Link to={`/join/${service._id}`}>Join again</Link>.</p>}

          {token.status === 'waiting' && token.likelyCounter && <p className="muted small with-icon"><MapPin size={14} aria-hidden /> Likely counter: {token.likelyCounter}. The final counter is announced when you are called.</p>}
          {token.status === 'waiting' && token.openCounters === 0 && <p className="small warn-text">No counters are open yet. Your place is kept.</p>}

          {live && (
            <div className="row wrap gap actions">
              {!token.checkedIn ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => action('check-in', 'Checked in. Staff can see you have arrived.')}><LogIn size={16} aria-hidden /> I have arrived</button>
              ) : (
                <button className="btn btn-ghost" disabled={busy} onClick={() => action('check-out', 'Checked out.')}><DoorOpen size={16} aria-hidden /> I have left the premises</button>
              )}
              <button className="btn btn-ghost" onClick={enableAlerts}><BellRing size={16} aria-hidden /> Turn on alerts</button>
              {token.status === 'waiting' && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => window.confirm('Cancel this token and give up your place?') && action('cancel', 'Token cancelled.')}>Cancel token</button>}
            </div>
          )}
          {live && <p className="muted small">Check in when you reach the building so the waiting room count stays accurate. Keep this page open for live updates.</p>}
        </div>

        {snap.data && (
          <div className="card">
            <h2 className="h3">Now being called</h2>
            {serving.length === 0 ? <p className="muted">No token is at a counter right now.</p> : (
              <ul className="plain-list">
                {serving.map((c) => <li key={c._id}><span>{c.name}</span><strong>{c.current.label}</strong></li>)}
              </ul>
            )}
            <CrowdMeter crowd={snap.data.crowd} />
          </div>
        )}
      </section>

      <aside className="card side center-text">
        <h2 className="h3">Show this at the desk</h2>
        <div className="qr-box"><QRCodeSVG value={trackUrl} size={190} level="M" marginSize={1} /></div>
        <div className="code-chip">{token.code}</div>
        <p className="muted small">Staff can scan this QR or type the code to find your token. Anyone with this link can see your status, so keep it private.</p>
      </aside>
    </div>
  );
}
