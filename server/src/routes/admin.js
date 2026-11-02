import { Router } from 'express';
import mongoose from 'mongoose';
import { Service, Token, User } from '../models.js';
import { HttpError, asyncHandler, dateKey, pick } from '../utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { crowdStatus } from '../queueEngine.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const key = dateKey();
    const [services, statusRows, waitRows, hourRows] = await Promise.all([
      Service.find().sort({ name: 1 }),
      Token.aggregate([
        { $match: { dateKey: key } },
        { $group: { _id: { service: '$service', status: '$status' }, count: { $sum: 1 } } },
      ]),
      Token.find({ dateKey: key, firstCalledAt: { $ne: null } }).select('service waitSeconds').lean(),
      Token.aggregate([
        { $match: { dateKey: key } },
        { $group: { _id: '$hour', count: { $sum: 1 } } },
      ]),
    ]);

    const rows = await Promise.all(
      services.map(async (s) => {
        const mine = statusRows.filter((r) => String(r._id.service) === String(s._id));
        const get = (st) => mine.find((r) => r._id.status === st)?.count || 0;
        const waits = waitRows.filter((r) => String(r.service) === String(s._id));
        return {
          _id: s._id,
          name: s.name,
          code: s.code,
          active: s.active,
          issued: mine.reduce((sum, r) => sum + r.count, 0),
          waiting: get('waiting'),
          completed: get('completed'),
          noShow: get('no_show'),
          avgWaitMinutes: waits.length ? Math.round(waits.reduce((sum, r) => sum + r.waitSeconds, 0) / waits.length / 60) : 0,
          crowd: await crowdStatus(s),
        };
      })
    );

    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourRows.find((r) => r._id === h)?.count || 0 }));
    const totals = rows.reduce(
      (t, r) => ({
        issued: t.issued + r.issued,
        waiting: t.waiting + r.waiting,
        completed: t.completed + r.completed,
        noShow: t.noShow + r.noShow,
      }),
      { issued: 0, waiting: 0, completed: 0, noShow: 0 }
    );
    const waited = rows.filter((r) => r.avgWaitMinutes > 0);
    totals.avgWaitMinutes = waited.length ? Math.round(waited.reduce((s, r) => s + r.avgWaitMinutes, 0) / waited.length) : 0;
    res.json({ totals, services: rows, hourly });
  })
);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await User.find().sort({ role: 1, name: 1 }).populate('service', 'name code');
    res.json({ users });
  })
);

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const { name, email, password, role = 'staff', service } = req.body || {};
    if (String(password || '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    if (!['admin', 'staff'].includes(role)) throw new HttpError(400, 'Invalid role');
    if (role === 'staff' && !mongoose.isValidObjectId(service)) throw new HttpError(400, 'Assign staff to a service');
    const user = await User.create({
      ...pick({ name, email, role }, ['name', 'email', 'role']),
      service: role === 'staff' ? service : null,
      passwordHash: await User.hashPassword(password),
    });
    await user.populate('service', 'name code');
    res.status(201).json({ user });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    if (String(req.user._id) === req.params.id) throw new HttpError(409, 'You cannot delete your own account');
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

export default router;
