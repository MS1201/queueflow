import { Router } from 'express';
import mongoose from 'mongoose';
import { Counter } from '../models.js';
import { HttpError, asyncHandler } from '../utils.js';
import { requireAuth, requireRole, assertServiceAccess } from '../middleware/auth.js';
import {
  setCounterStatus, callNext, startServing, completeToken, markNoShow, recallToken, rebalance,
} from '../queueEngine.js';
import { emitServiceUpdate } from '../socket.js';

const router = Router();
router.use(requireAuth);

const loadCounter = asyncHandler(async (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Counter not found');
  const counter = await Counter.findById(req.params.id);
  if (!counter) throw new HttpError(404, 'Counter not found');
  assertServiceAccess(req.user, counter.service);
  req.counter = counter;
  next();
});

router.patch(
  '/:id/status',
  loadCounter,
  asyncHandler(async (req, res) => {
    const counter = await setCounterStatus(req.counter, String(req.body?.status || ''));
    res.json({ counter });
  })
);

router.post(
  '/:id/call-next',
  loadCounter,
  asyncHandler(async (req, res) => {
    const token = await callNext(req.counter);
    res.json({ token, message: token ? `Called ${token.label}` : 'The queue is empty' });
  })
);

const simple = {
  start: [startServing, (t) => `Serving ${t.label}`],
  complete: [completeToken, (t) => `Completed ${t.label}`],
  'no-show': [markNoShow, (t) => `${t.label} marked as no-show`],
  recall: [recallToken, (t) => `Recalled ${t.label}`],
};
for (const [path, [fn, msg]] of Object.entries(simple)) {
  router.post(
    `/:id/${path}`,
    loadCounter,
    asyncHandler(async (req, res) => {
      const token = await fn(req.counter);
      res.json({ token, message: msg(token) });
    })
  );
}

router.delete(
  '/:id',
  requireRole('admin'),
  loadCounter,
  asyncHandler(async (req, res) => {
    if (req.counter.currentToken) throw new HttpError(409, 'Finish the current token before removing this counter');
    const { service } = req.counter;
    await req.counter.deleteOne();
    await rebalance(service);
    emitServiceUpdate(service, { event: 'counter' });
    res.json({ ok: true });
  })
);

export default router;
