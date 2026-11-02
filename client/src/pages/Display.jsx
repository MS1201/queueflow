import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { api } from '../api.js';
import { useLive, useNow } from '../hooks.js';
import { fmtWait, playChime, speak, CATEGORY_LABEL, CROWD_LABEL } from '../utils.js';
import { Spinner, ErrorNote } from '../components/ui.jsx';

function Picker() {
  const { data, error, loading } = useLive(() => api('/services'), null, 'display-picker');
  return (
    <div className="display-screen picker">
      <h1>Choose a lobby screen</h1>
      {loading && <Spinner />}
      <ErrorNote error={error} />
      <ul>{data?.services.map((s) => <li key={s._id}><Link to={`/display/${s._id}`}>{s.name}</Link></li>)}</ul>
    </div>
  );
}

function Screen({ id }) {
  const { data, error, loading } = useLive(() => api(`/services/${id}/snapshot`), id, id);
  const now = useNow(1000);
  const [sound, setSound] = useState(false);
  const seen = useRef(null);

  const counters = data?.counters || [];
  const calling = counters
    .filter((c) => c.current && ['called', 'serving'].includes(c.current.status))
    .sort((a, b) => new Date(b.current.calledAt) - new Date(a.current.calledAt));
  const latest = calling[0];

  // Announce each new (or repeated) call once.
  useEffect(() => {
    if (!data) return;
    const signature = new Map(counters.filter((c) => c.current?.status === 'called').map((c) => [c._id, `${c.current.label}|${c.current.calledAt}`]));
    if (seen.current && sound) {
      for (const [cid, sig] of signature) {
        if (seen.current.get(cid) !== sig) {
          const c = counters.find((x) => x._id === cid);
          playChime();
          setTimeout(() => speak(`Token ${c.current.label.replace('-', ' ')}, please proceed to ${c.name}.`), 700);
        }
      }
    }
    seen.current = signature;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="display-screen"><Spinner label="Connecting to the queue" /></div>;
  if (error && !data) return <div className="display-screen"><ErrorNote error={error} /></div>;
  const { service, waiting, crowd } = data;

  return (
    <div className="display-screen">
      <header className="display-head">
        <div>
          <div className="display-sub">{CATEGORY_LABEL[service.category]}</div>
          <h1>{service.name}</h1>
        </div>
        <div className="display-clock tabular">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </header>

      <div className="display-grid">
        <section className="display-main">
          <div className="now-calling" key={latest ? `${latest.current.label}${latest.current.calledAt}` : 'idle'}>
            <div className="display-sub">Now calling</div>
            {latest ? (
              <>
                <div className="now-token">{latest.current.label}</div>
                <div className="now-counter">Please go to {latest.name}</div>
              </>
            ) : (
              <div className="now-idle">{data.openCounters ? 'Waiting for the next token' : 'Counters are closed'}</div>
            )}
          </div>
          <div className="counter-tiles">
            {counters.map((c) => (
              <div key={c._id} className={`tile ${c.status !== 'open' ? 'tile-off' : ''}`}>
                <div className="tile-name">{c.name}</div>
                <div className="tile-token">{c.status !== 'open' ? (c.status === 'break' ? 'On break' : 'Closed') : c.current ? c.current.label : 'Free'}</div>
              </div>
            ))}
          </div>
        </section>

        <aside className="display-side">
          <h2>Up next</h2>
          {waiting.length === 0 ? <p className="display-sub">Nobody is waiting.</p> : (
            <ol className="next-list">
              {waiting.slice(0, 8).map((t) => (
                <li key={t.label}>
                  <strong>{t.label}</strong>
                  <span>{t.priority !== 'normal' ? t.priority : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <dl className="display-facts">
            <div><dt>Waiting</dt><dd>{data.waitingCount}</dd></div>
            <div><dt>New token wait</dt><dd>{fmtWait(data.estimatedWait).replace('about ', '~')}</dd></div>
            <div><dt>Waiting room</dt><dd>{CROWD_LABEL[crowd.level]} ({crowd.occupancy}/{crowd.capacity})</dd></div>
          </dl>
          <p className="display-join">Join from your phone: open this site and choose {service.name}.</p>
        </aside>
      </div>

      <button className="sound-toggle" onClick={() => { setSound((s) => !s); if (!sound) playChime(); }} aria-pressed={sound}>
        {sound ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />} {sound ? 'Announcements on' : 'Turn on announcements'}
      </button>
    </div>
  );
}

export default function Display() {
  const { id } = useParams();
  useEffect(() => { document.body.classList.add('dark-body'); return () => document.body.classList.remove('dark-body'); }, []);
  return id ? <Screen id={id} /> : <Picker />;
}
