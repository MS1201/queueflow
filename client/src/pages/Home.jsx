import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Users, MapPin, Monitor, ArrowRight } from 'lucide-react';
import { api } from '../api.js';
import { useLive } from '../hooks.js';
import { CrowdMeter, Empty, ErrorNote, Spinner } from '../components/ui.jsx';
import { CATEGORY_LABEL, fmtWait, getMyTokens } from '../utils.js';

function TicketStub() {
  return (
    <div className="ticket" aria-hidden>
      <div className="ticket-main">
        <div className="ticket-small">Your token</div>
        <div className="ticket-label">H-014</div>
        <div className="ticket-row"><span>Ahead of you</span><strong>3 people</strong></div>
        <div className="ticket-row"><span>Estimated wait</span><strong>about 12 min</strong></div>
        <div className="ticket-progress"><i style={{ width: '62%' }} /></div>
      </div>
      <div className="ticket-cut" />
      <div className="ticket-stub">
        <div className="qr-fake">
          {Array.from({ length: 49 }, (_, i) => <i key={i} className={[0, 1, 2, 7, 9, 14, 16, 21, 24, 26, 30, 33, 35, 36, 40, 42, 44, 47, 48].includes(i) ? 'on' : ''} />)}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ s }) {
  const closed = s.openCounters === 0;
  return (
    <article className="card service-card">
      <header>
        <div className="muted small">{CATEGORY_LABEL[s.category]}</div>
        <h3>{s.name}</h3>
        {s.address && <div className="muted small with-icon"><MapPin size={14} aria-hidden /> {s.address}</div>}
      </header>
      <dl className="mini-stats">
        <div><dt><Users size={14} aria-hidden /> In queue</dt><dd>{s.waitingCount}</dd></div>
        <div><dt><Clock size={14} aria-hidden /> Wait for a new token</dt><dd>{fmtWait(s.estimatedWait)}</dd></div>
      </dl>
      <CrowdMeter crowd={s.crowd} compact />
      <footer>
        <Link className="btn btn-primary" to={`/join/${s._id}`}>Join queue <ArrowRight size={16} aria-hidden /></Link>
        <Link className="btn btn-ghost" to={`/display/${s._id}`} target="_blank" rel="noreferrer">
          <Monitor size={16} aria-hidden /> Lobby screen
        </Link>
      </footer>
      {closed && <p className="small warn-text">No counters are open right now. You can still join and keep your place.</p>}
    </article>
  );
}

const FEATURES = [
  ['Virtual tokens with QR', 'Every token has a QR code and a short code you can show at the desk.'],
  ['Live place in line', 'Position and wait time update the moment a counter calls the next person.'],
  ['Several counters, one queue', 'Tokens are shared across open counters and rebalanced as counters open or close.'],
  ['Priority lanes', 'Seniors, accessibility needs and staff-verified emergencies move ahead fairly.'],
  ['No-show handling', 'Called but absent? The token expires after a grace period and the line moves on.'],
  ['Crowd monitoring', 'Check-ins and check-outs show how full the waiting room is right now.'],
  ['Lobby display', 'A big-screen view with the tokens being called and a voice announcement.'],
  ['Staff and admin tools', 'Run a counter, add services, and see the day’s numbers in one place.'],
];

export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const { data, error, loading, reload } = useLive(() => api('/services'), null, 'home');
  const mine = getMyTokens();

  function lookup(e) {
    e.preventDefault();
    let c = code.trim();
    if (c.includes('/')) c = c.split('/').filter(Boolean).pop();
    if (c) navigate(`/track/${encodeURIComponent(c.toUpperCase())}`);
  }

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <h1 className="display">Wait anywhere except in line.</h1>
            <p className="lead">
              Take a token from your phone, watch your place move in real time, and arrive when your turn is close.
              Built for hospitals, banks, government offices and service centers.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-lg" href="#services">Find a service</a>
              <form className="inline-form" onSubmit={lookup}>
                <input aria-label="Token code or tracking link" placeholder="Have a token? Enter its code" value={code} onChange={(e) => setCode(e.target.value)} />
                <button className="btn btn-ghost">Track</button>
              </form>
            </div>
          </div>
          <TicketStub />
        </div>
      </section>

      {mine.length > 0 && (
        <section className="container section tight">
          <h2 className="h2">Your tokens today</h2>
          <div className="row wrap gap">
            {mine.map((t) => (
              <Link key={t.code} to={`/track/${t.code}`} className="card token-pill">
                <strong>{t.label}</strong><span className="muted small">{t.serviceName}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container section" id="services">
        <h2 className="h2">Services open for queueing</h2>
        {loading && <Spinner label="Loading services" />}
        <ErrorNote error={error} retry={reload} />
        {data && data.services.length === 0 && <Empty title="No services yet">An administrator needs to add a service before queues can start.</Empty>}
        <div className="grid-cards">{data?.services.map((s) => <ServiceCard key={s._id} s={s} />)}</div>
      </section>

      <section className="container section">
        <h2 className="h2">What is in the platform</h2>
        <ul className="features">
          {FEATURES.map(([t, d]) => (
            <li key={t}><strong>{t}</strong><span>{d}</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}
