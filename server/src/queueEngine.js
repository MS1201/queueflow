import crypto from 'crypto';
import {
  Service, Counter, Token, CrowdEvent, Sequence,
  PRIORITY_RANK, QUEUE_SORT,
} from './models.js';
import { emitServiceUpdate } from './socket.js';
import { HttpError, dateKey, hourOfDay } from './utils.js';

/* ------------------------------------------------------------------ *
 *  Estimation helpers
 * ------------------------------------------------------------------ */

/** Blend the configured average with what counters actually achieved recently. */
export async function getAvgServiceMinutes(service) {
  const recent = await Token.find({ service: service._id, status: 'completed', serviceSeconds: { $gt: 0 } })
    .sort({ completedAt: -1 })
    .limit(20)
    .select('serviceSeconds')
    .lean();
  if (recent.length < 3) return service.avgServiceMinutes;
  const observed = recent.reduce((s, t) => s + t.serviceSeconds, 0) / recent.length / 60;
  const weight = Math.min(recent.length / 20, 1);
  const blended = observed * weight + service.avgServiceMinutes * (1 - weight);
  return Math.max(1, Math.round(blended * 10) / 10);
}

async function queueContext(service) {
  const [counters, waitingCount, avg] = await Promise.all([
    Counter.find({ service: service._id }).sort({ createdAt: 1, _id: 1 }).lean(),
    Token.countDocuments({ service: service._id, status: 'waiting' }),
    getAvgServiceMinutes(service),
  ]);
  const open = counters.filter((c) => c.status === 'open');
  const idle = open.filter((c) => !c.currentToken).length;
  return { counters, open: open.length, idle, waitingCount, avg };
}

/** Minutes until a token at `position` (1-based) is likely to be called. null = no open counter. */
export function estimateWait(position, ctx) {
  if (ctx.open === 0) return null;
  const ahead = position - 1;
  if (ahead < ctx.idle) return 0;
  return Math.max(1, Math.round(((ahead - ctx.idle + 1) / ctx.open) * ctx.avg));
}

export async function crowdStatus(service) {
  const occupancy = await Token.countDocuments({ service: service._id, checkedIn: true });
  const capacity = service.capacity;
  const percent = capacity > 0 ? Math.round((occupancy / capacity) * 100) : 0;
  const level = percent >= 100 ? 'full' : percent >= 80 ? 'high' : percent >= 50 ? 'moderate' : 'low';
  return { occupancy, capacity, percent, level };
}

async function todayStats(service) {
  const key = dateKey();
  const [rows, wait] = await Promise.all([
    Token.aggregate([
      { $match: { service: service._id, dateKey: key } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Token.find({ service: service._id, dateKey: key, firstCalledAt: { $ne: null } }).select('waitSeconds').lean(),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const issued = rows.reduce((s, r) => s + r.count, 0);
  return {
    issued,
    waiting: by.waiting || 0,
    completed: by.completed || 0,
    noShow: by.no_show || 0,
    expired: by.expired || 0,
    cancelled: by.cancelled || 0,
    avgWaitMinutes: wait.length ? Math.round(wait.reduce((s, t) => s + t.waitSeconds, 0) / wait.length / 60) : 0,
  };
}

/* ------------------------------------------------------------------ *
 *  Read models
 * ------------------------------------------------------------------ */

export async function getBrief(service) {
  const ctx = await queueContext(service);
  const crowd = await crowdStatus(service);
  return {
    ...service.toObject(),
    counters: ctx.counters.map((c) => ({ _id: c._id, name: c.name, status: c.status })),
    waitingCount: ctx.waitingCount,
    openCounters: ctx.open,
    avgServiceMinutes: service.avgServiceMinutes,
    liveAvgMinutes: ctx.avg,
    estimatedWait: estimateWait(ctx.waitingCount + 1, ctx),
    crowd,
  };
}

/** Public snapshot: safe to show on a lobby screen (no names or phone numbers). */
export async function getSnapshot(service) {
  const ctx = await queueContext(service);
  const currentIds = ctx.counters.map((c) => c.currentToken).filter(Boolean);
  const [current, waiting, crowd, stats] = await Promise.all([
    Token.find({ _id: { $in: currentIds } }).select('label priority status calledAt recallCount').lean(),
    Token.find({ service: service._id, status: 'waiting' })
      .sort(QUEUE_SORT)
      .limit(30)
      .select('label priority assignedCounter')
      .lean(),
    crowdStatus(service),
    todayStats(service),
  ]);
  const currentById = new Map(current.map((t) => [String(t._id), t]));
  const nameById = new Map(ctx.counters.map((c) => [String(c._id), c.name]));
  return {
    service: service.toObject(),
    avgServiceMinutes: ctx.avg,
    openCounters: ctx.open,
    waitingCount: ctx.waitingCount,
    estimatedWait: estimateWait(ctx.waitingCount + 1, ctx),
    counters: ctx.counters.map((c) => ({
      _id: c._id,
      name: c.name,
      status: c.status,
      current: c.currentToken ? currentById.get(String(c.currentToken)) || null : null,
    })),
    waiting: waiting.map((t, i) => ({
      label: t.label,
      priority: t.priority,
      position: i + 1,
      counter: t.assignedCounter ? nameById.get(String(t.assignedCounter)) || null : null,
    })),
    crowd,
    stats,
    serverTime: Date.now(),
  };
}

/** What a customer sees when they open their own token link. */
export async function getTokenView(token) {
  const service = await Service.findById(token.service);
  const ctx = await queueContext(service);
  const nameById = new Map(ctx.counters.map((c) => [String(c._id), c.name]));
  let position = null;
  let estimatedWait = null;
  if (token.status === 'waiting') {
    const ahead = await Token.countDocuments({
      service: token.service,
      status: 'waiting',
      $or: [
        { priorityRank: { $lt: token.priorityRank } },
        { priorityRank: token.priorityRank, createdAt: { $lt: token.createdAt } },
        { priorityRank: token.priorityRank, createdAt: token.createdAt, seq: { $lt: token.seq } },
      ],
    });
    position = ahead + 1;
    estimatedWait = estimateWait(position, ctx);
  }
  return {
    token: {
      code: token.code,
      label: token.label,
      name: token.name,
      priority: token.priority,
      status: token.status,
      position,
      ahead: position ? position - 1 : null,
      estimatedWait,
      openCounters: ctx.open,
      counter: token.counter ? nameById.get(String(token.counter)) || null : null,
      likelyCounter: token.assignedCounter ? nameById.get(String(token.assignedCounter)) || null : null,
      checkedIn: token.checkedIn,
      createdAt: token.createdAt,
      calledAt: token.calledAt,
      noShowDeadline:
        token.status === 'called' ? new Date(token.calledAt.getTime() + service.noShowSeconds * 1000) : null,
      recallCount: token.recallCount,
    },
    service: {
      _id: service._id,
      name: service.name,
      code: service.code,
      address: service.address,
      noShowSeconds: service.noShowSeconds,
      capacity: service.capacity,
    },
    serverTime: Date.now(),
  };
}

/* ------------------------------------------------------------------ *
 *  Token lifecycle
 * ------------------------------------------------------------------ */

export async function issueToken(service, { name, phone = '', priority = 'normal', source = 'remote' }) {
  const key = dateKey();
  let seq;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const doc = await Sequence.findOneAndUpdate(
        { key: `${service._id}:${key}` },
        { $inc: { value: 1 } },
        { returnDocument: 'after', upsert: true }
      );
      seq = doc.value;
      break;
    } catch (err) {
      // Two simultaneous first-of-the-day upserts can collide once; retry.
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
  const token = await Token.create({
    service: service._id,
    seq,
    label: `${service.code}-${String(seq).padStart(3, '0')}`,
    code: crypto.randomBytes(5).toString('hex').toUpperCase(),
    dateKey: key,
    hour: hourOfDay(),
    name,
    phone,
    priority,
    priorityRank: PRIORITY_RANK[priority],
    source,
  });
  await rebalance(service._id);
  emitServiceUpdate(service._id, { event: 'issued' });
  return Token.findById(token._id);
}

async function recordCrowdEvent(token, type) {
  await CrowdEvent.create({ service: token.service, token: token._id, type });
}

export async function checkInToken(token) {
  if (!['waiting', 'called', 'serving'].includes(token.status)) {
    throw new HttpError(409, 'This token is no longer active');
  }
  if (token.checkedIn) return token;
  const updated = await Token.findOneAndUpdate(
    { _id: token._id, checkedIn: false },
    { $set: { checkedIn: true, checkedInAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (updated) await recordCrowdEvent(updated, 'check_in');
  emitServiceUpdate(token.service, { event: 'crowd' });
  return updated || Token.findById(token._id);
}

export async function checkOutToken(token) {
  const updated = await Token.findOneAndUpdate(
    { _id: token._id, checkedIn: true },
    { $set: { checkedIn: false } },
    { returnDocument: 'after' }
  );
  if (updated) {
    await recordCrowdEvent(updated, 'check_out');
    emitServiceUpdate(token.service, { event: 'crowd' });
  }
  return updated || Token.findById(token._id);
}

export async function cancelToken(token) {
  if (token.status !== 'waiting') throw new HttpError(409, 'Only waiting tokens can be cancelled');
  const updated = await Token.findOneAndUpdate(
    { _id: token._id, status: 'waiting' },
    { $set: { status: 'cancelled', completedAt: new Date(), assignedCounter: null } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new HttpError(409, 'Your token was just called and cannot be cancelled');
  await checkOutToken(updated);
  await rebalance(token.service);
  emitServiceUpdate(token.service, { event: 'cancelled' });
  return Token.findById(token._id);
}

/* ------------------------------------------------------------------ *
 *  Dynamic balancing: spread waiting tokens over open counters so each
 *  customer sees a likely counter, and the load stays even when counters
 *  open, close, or finish at different speeds.
 * ------------------------------------------------------------------ */

export async function rebalance(serviceId) {
  const [counters, waiting] = await Promise.all([
    Counter.find({ service: serviceId, status: 'open' }).sort({ createdAt: 1, _id: 1 }).lean(),
    Token.find({ service: serviceId, status: 'waiting' }).sort(QUEUE_SORT).select('assignedCounter').lean(),
  ]);
  const ops = [];
  if (counters.length === 0) {
    waiting.forEach((t) => {
      if (t.assignedCounter) {
        ops.push({ updateOne: { filter: { _id: t._id, status: 'waiting' }, update: { $set: { assignedCounter: null } } } });
      }
    });
  } else {
    const load = new Map(counters.map((c) => [String(c._id), c.currentToken ? 1 : 0]));
    for (const t of waiting) {
      let best = counters[0];
      let bestLoad = Infinity;
      for (const c of counters) {
        const l = load.get(String(c._id));
        if (l < bestLoad) {
          best = c;
          bestLoad = l;
        }
      }
      load.set(String(best._id), bestLoad + 1);
      if (String(t.assignedCounter || '') !== String(best._id)) {
        ops.push({ updateOne: { filter: { _id: t._id, status: 'waiting' }, update: { $set: { assignedCounter: best._id } } } });
      }
    }
  }
  if (ops.length) await Token.bulkWrite(ops);
}

/* ------------------------------------------------------------------ *
 *  Counter operations
 * ------------------------------------------------------------------ */

export async function setCounterStatus(counter, status) {
  if (!['open', 'closed', 'break'].includes(status)) throw new HttpError(400, 'Invalid counter status');
  if (status !== 'open' && counter.currentToken) {
    throw new HttpError(409, 'Finish or release the current token before closing this counter');
  }
  counter.status = status;
  await counter.save();
  await rebalance(counter.service);
  emitServiceUpdate(counter.service, { event: 'counter' });
  return counter;
}

export async function callNext(counter) {
  if (counter.status !== 'open') throw new HttpError(409, 'Open the counter before calling tokens');
  if (counter.currentToken) throw new HttpError(409, 'Finish the current token first');
  const now = new Date();
  // Atomic claim: two counters can never take the same token.
  const token = await Token.findOneAndUpdate(
    { service: counter.service, status: 'waiting' },
    { $set: { status: 'called', counter: counter._id, assignedCounter: null, calledAt: now, firstCalledAt: now, recallCount: 0 } },
    { sort: QUEUE_SORT, returnDocument: 'after' }
  );
  if (!token) return null;
  token.waitSeconds = Math.max(0, Math.round((now.getTime() - token.createdAt.getTime()) / 1000));
  await Token.updateOne({ _id: token._id }, { $set: { waitSeconds: token.waitSeconds } });
  const claimed = await Counter.findOneAndUpdate(
    { _id: counter._id, status: 'open', currentToken: null },
    { $set: { currentToken: token._id } },
    { returnDocument: 'after' }
  );
  if (!claimed) {
    await Token.updateOne(
      { _id: token._id },
      { $set: { status: 'waiting', counter: null, calledAt: null, firstCalledAt: null } }
    );
    throw new HttpError(409, 'This counter is busy');
  }
  await rebalance(counter.service);
  emitServiceUpdate(counter.service, { event: 'called', label: token.label, counter: counter.name });
  return token;
}

async function activeTokenOf(counter, allowed) {
  if (!counter.currentToken) throw new HttpError(409, 'There is no active token at this counter');
  const token = await Token.findById(counter.currentToken);
  if (!token || !allowed.includes(token.status)) {
    await Counter.updateOne({ _id: counter._id }, { $set: { currentToken: null } });
    throw new HttpError(409, 'Counter state was out of date and has been refreshed');
  }
  return token;
}

async function releaseCounter(counter, token, patch) {
  const updated = await Token.findOneAndUpdate(
    { _id: token._id, status: { $in: ['called', 'serving'] } },
    { $set: { ...patch, completedAt: new Date() } },
    { returnDocument: 'after' }
  );
  await Counter.updateOne({ _id: counter._id, currentToken: token._id }, { $set: { currentToken: null } });
  if (updated) await checkOutToken(updated);
  await rebalance(counter.service);
  emitServiceUpdate(counter.service, { event: patch.status });
  return updated || token;
}

export async function startServing(counter) {
  const token = await activeTokenOf(counter, ['called']);
  const updated = await Token.findOneAndUpdate(
    { _id: token._id, status: 'called' },
    { $set: { status: 'serving', startedAt: new Date() } },
    { returnDocument: 'after' }
  );
  emitServiceUpdate(counter.service, { event: 'serving' });
  return updated;
}

export async function completeToken(counter) {
  const token = await activeTokenOf(counter, ['called', 'serving']);
  const started = token.startedAt || token.calledAt || new Date();
  const seconds = Math.max(1, Math.round((Date.now() - started.getTime()) / 1000));
  return releaseCounter(counter, token, { status: 'completed', serviceSeconds: seconds });
}

export async function markNoShow(counter) {
  const token = await activeTokenOf(counter, ['called']);
  return releaseCounter(counter, token, { status: 'no_show' });
}

export async function recallToken(counter) {
  const token = await activeTokenOf(counter, ['called']);
  const updated = await Token.findOneAndUpdate(
    { _id: token._id, status: 'called' },
    { $set: { calledAt: new Date() }, $inc: { recallCount: 1 } },
    { returnDocument: 'after' }
  );
  emitServiceUpdate(counter.service, { event: 'recall', label: token.label, counter: counter.name });
  return updated;
}

/* ------------------------------------------------------------------ *
 *  Background sweeper: no-show detection and token expiry
 * ------------------------------------------------------------------ */

export async function sweep() {
  const services = await Service.find().lean();
  const today = dateKey();
  for (const s of services) {
    let changed = false;

    const noShowCutoff = new Date(Date.now() - s.noShowSeconds * 1000);
    const stale = await Token.find({ service: s._id, status: 'called', calledAt: { $lt: noShowCutoff } });
    for (const t of stale) {
      const updated = await Token.findOneAndUpdate(
        { _id: t._id, status: 'called' },
        { $set: { status: 'no_show', completedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!updated) continue;
      await Counter.updateOne({ _id: t.counter, currentToken: t._id }, { $set: { currentToken: null } });
      await checkOutToken(updated);
      changed = true;
    }

    const expiryCutoff = new Date(Date.now() - s.tokenExpiryMinutes * 60000);
    const old = await Token.find({
      service: s._id,
      status: 'waiting',
      $or: [{ createdAt: { $lt: expiryCutoff } }, { dateKey: { $ne: today } }],
    });
    for (const t of old) {
      const updated = await Token.findOneAndUpdate(
        { _id: t._id, status: 'waiting' },
        { $set: { status: 'expired', completedAt: new Date(), assignedCounter: null } },
        { returnDocument: 'after' }
      );
      if (!updated) continue;
      await checkOutToken(updated);
      changed = true;
    }

    if (changed) {
      await rebalance(s._id);
      emitServiceUpdate(s._id, { event: 'sweep' });
    }
  }
}
