import { Accessibility, Siren, UserRound, Loader2, AlertCircle } from 'lucide-react';
import { CROWD_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../utils.js';

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="center-note" role="status">
      <Loader2 className="spin" size={20} aria-hidden /> <span>{label}…</span>
    </div>
  );
}

export function ErrorNote({ error, retry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <AlertCircle size={18} aria-hidden />
      <div>
        <strong>{error.message || 'Something went wrong.'}</strong>
        {retry && (
          <div><button className="link-btn" onClick={retry}>Try again</button></div>
        )}
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

const PRIORITY_ICON = { senior: UserRound, accessibility: Accessibility, emergency: Siren };

export function PriorityBadge({ priority }) {
  if (!priority || priority === 'normal') return null;
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={`chip chip-${priority}`}>
      {Icon && <Icon size={12} aria-hidden />} {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusChip({ status }) {
  return <span className={`chip status-${status}`}><i className="dot" aria-hidden /> {STATUS_LABEL[status] || status}</span>;
}

export function CrowdMeter({ crowd, compact = false }) {
  if (!crowd) return null;
  const pct = Math.min(100, crowd.percent);
  return (
    <div className={`crowd crowd-${crowd.level} ${compact ? 'crowd-compact' : ''}`}>
      <div className="crowd-head">
        <span>{CROWD_LABEL[crowd.level]}</span>
        <span className="muted">{crowd.occupancy} of {crowd.capacity} inside</span>
      </div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Crowd level">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

/** Simple accessible bar chart: data = [{ label, value, value2? }] */
export function Bars({ data, height = 140, names = ['Count'], labelEvery = 1 }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.value2 || 0]));
  return (
    <div>
      <div className="bars" style={{ height }} role="img" aria-label={`Bar chart of ${names.join(' and ')}`}>
        {data.map((d, i) => (
          <div className="bar-col" key={i} title={`${d.label}: ${d.value}${d.value2 !== undefined ? ` / ${d.value2}` : ''}`}>
            <div className="bar-pair">
              <div className="bar b1" style={{ height: `${(d.value / max) * 100}%` }} />
              {d.value2 !== undefined && <div className="bar b2" style={{ height: `${(d.value2 / max) * 100}%` }} />}
            </div>
            <div className="bar-label">{i % labelEvery === 0 ? d.label : ''}</div>
          </div>
        ))}
      </div>
      {names.length > 1 && (
        <div className="legend">
          <span><i className="swatch b1" /> {names[0]}</span>
          <span><i className="swatch b2" /> {names[1]}</span>
        </div>
      )}
    </div>
  );
}
