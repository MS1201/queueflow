export const PRIORITY_LABEL = { normal: 'Standard', senior: 'Senior citizen', accessibility: 'Accessibility', emergency: 'Emergency' };
export const STATUS_LABEL = {
  waiting: 'Waiting', called: 'Called', serving: 'Being served', completed: 'Completed',
  no_show: 'No-show', expired: 'Expired', cancelled: 'Cancelled',
};
export const CATEGORY_LABEL = {
  hospital: 'Hospital', bank: 'Bank', government: 'Government office', service_center: 'Service center', other: 'Other',
};
export const CROWD_LABEL = { low: 'Quiet', moderate: 'Moderate', high: 'Busy', full: 'At capacity' };

export function fmtWait(minutes) {
  if (minutes === null || minutes === undefined) return 'No counter open';
  if (minutes <= 0) return 'Next up';
  if (minutes < 60) return `about ${minutes} min`;
  return `about ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const minutesSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

const MY_KEY = 'qf_my_tokens';
export function getMyTokens() {
  try {
    const all = JSON.parse(localStorage.getItem(MY_KEY) || '[]');
    const today = new Date().toDateString();
    return all.filter((t) => t.day === today);
  } catch {
    return [];
  }
}
export function saveMyToken({ code, label, serviceName }) {
  try {
    const rest = getMyTokens().filter((t) => t.code !== code);
    localStorage.setItem(MY_KEY, JSON.stringify([{ code, label, serviceName, day: new Date().toDateString() }, ...rest].slice(0, 6)));
  } catch { /* storage unavailable */ }
}
export function removeMyToken(code) {
  try {
    localStorage.setItem(MY_KEY, JSON.stringify(getMyTokens().filter((t) => t.code !== code)));
  } catch { /* storage unavailable */ }
}

let audioCtx;
/** A short two-note chime. Browsers only allow it after the person has interacted with the page. */
export function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    [[660, 0], [880, 0.18]].forEach(([freq, offset]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.55);
    });
  } catch { /* audio unavailable */ }
}

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable */ }
}
