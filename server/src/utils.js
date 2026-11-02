import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD in the configured timezone. Used for daily numbering and "today" stats. */
export const dateKey = (d = new Date()) => dayFormatter.format(d);

export const pick = (obj, keys) =>
  keys.reduce((acc, k) => (obj?.[k] !== undefined ? { ...acc, [k]: obj[k] } : acc), {});

const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', hourCycle: 'h23' });

/** Hour of day (0-23) in the configured timezone. */
export const hourOfDay = (d = new Date()) => Number(hourFormatter.format(d)) % 24;
