import { Router } from 'express';
import mongoose from 'mongoose';
import { Service, Counter, Token, CrowdEvent, User } from '../models.js';
import { HttpError, asyncHandler, pick } from '../utils.js';
import { authOptional, requireAuth, requireRole, assertServiceAccess } from '../middleware/auth.js';
import { getBrief, getSnapshot, crowdStatus } from '../queueEngine.js';

const router = Router();
const FIELDS = ['name', 'code', 'category', 'address', 'avgServiceMinutes', 'capacity', 'noShowSeconds', 'tokenExpiryMinutes', 'active'];

const loadService = asyncHandler(async (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Service not found');
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found');
  req.service = service;
  next();
});

router.get(
  '/',
  authOptional,
  asyncHandler(async (req, res) => {
    const includeInactive = req.user?.role === 'admin' && req.query.all === '1';
    const services = await Service.find(includeInactive ? {} : { active: true }).sort({ name: 1 });
    res.json({ services: await Promise.all(services.map(getBrief)) });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const service = await Service.create(pick(req.body, FIELDS));
    res.status(201).json({ service: await getBrief(service) });
  })
);

router.get('/:id', loadService, asyncHandler(async (req, res) => res.json({ service: await getBrief(req.service) })));

router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  loadService,
  asyncHandler(async (req, res) => {
    Object.assign(req.service, pick(req.body, FIELDS));
    await req.service.save();
    res.json({ service: await getBrief(req.service) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  loadService,
  asyncHandler(async (req, res) => {
    const id = req.service._id;
    await Promise.all([
      Counter.deleteMany({ service: id }),
      Token.deleteMany({ service: id }),
      CrowdEvent.deleteMany({ service: id }),
      User.updateMany({ service: id }, { $set: { service: null } }),
    ]);
    await req.service.deleteOne();
    res.json({ ok: true });
  })
);

router.get('/:id/snapshot', loadService, asyncHandler(async (req, res) => res.json(await getSnapshot(req.service))));

/** Staff-only detail: names, phones and who is at each counter. */
router.get(
  '/:id/queue',
  requireAuth,
  loadService,
  asyncHandler(async (req, res) => {
    assertServiceAccess(req.user, req.service._id);
    const fields = 'label name phone priority status source createdAt calledAt startedAt checkedIn counter assignedCounter recallCount';
    const [waiting, active, recent] = await Promise.all([
      Token.find({ service: req.service._id, status: 'waiting' })
        .sort({ priorityRank: 1, createdAt: 1, seq: 1 })
        .limit(100)
        .select(fields)
        .lean(),
      Token.find({ service: req.service._id, status: { $in: ['called', 'serving'] } }).select(fields).lean(),
      Token.find({ service: req.service._id, status: { $in: ['completed', 'no_show', 'cancelled', 'expired'] } })
        .sort({ completedAt: -1 })
        .limit(8)
        .select(`${fields} completedAt serviceSeconds`)
        .lean(),
    ]);
    res.json({ waiting, active, recent });
  })
);

router.post(
  '/:id/counters',
  requireAuth,
  requireRole('admin'),
  loadService,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) throw new HttpError(400, 'Enter a counter name');
    const counter = await Counter.create({ service: req.service._id, name, status: 'closed' });
    res.status(201).json({ counter });
  })
);

router.get(
  '/:id/crowd',
  loadService,
  asyncHandler(async (req, res) => {
    const hours = 12;
    const base = new Date();
    base.setMinutes(0, 0, 0);
    const start = new Date(base.getTime() - (hours - 1) * 3600000);
    const events = await CrowdEvent.find({ service: req.service._id, at: { $gte: start } }).select('type at').lean();
    const history = Array.from({ length: hours }, (_, i) => ({
      hour: new Date(start.getTime() + i * 3600000).toISOString(),
      checkIns: 0,
      checkOuts: 0,
    }));
    for (const e of events) {
      const idx = Math.floor((e.at.getTime() - start.getTime()) / 3600000);
      if (idx >= 0 && idx < hours) history[idx][e.type === 'check_in' ? 'checkIns' : 'checkOuts'] += 1;
    }
    res.json({ crowd: await crowdStatus(req.service), history });
  })
);

export default router;
