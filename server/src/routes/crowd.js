import { Router } from 'express';
import mongoose from 'mongoose';
import { Token, ACTIVE_STATUSES } from '../models.js';
import { HttpError, asyncHandler, dateKey } from '../utils.js';
import { requireAuth, assertServiceAccess } from '../middleware/auth.js';
import { checkInToken, checkOutToken } from '../queueEngine.js';

const router = Router();
router.use(requireAuth);

/** Staff gate desk: accepts a token code, a pasted tracking link, or a label like H-012. */
async function findByRef(serviceId, rawRef) {
  if (!mongoose.isValidObjectId(serviceId)) throw new HttpError(400, 'Choose a service');
  let ref = String(rawRef || '').trim();
  if (!ref) throw new HttpError(400, 'Enter a token code or number');
  if (ref.includes('/')) ref = ref.split('/').filter(Boolean).pop();
  ref = ref.toUpperCase();
  const token =
    (await Token.findOne({ service: serviceId, code: ref })) ||
    (await Token.findOne({ service: serviceId, label: ref, dateKey: dateKey() }));
  if (!token) throw new HttpError(404, 'No token matches that code for this service');
  return token;
}

for (const [path, fn] of [['check-in', checkInToken], ['check-out', checkOutToken]]) {
  router.post(
    `/${path}`,
    asyncHandler(async (req, res) => {
      assertServiceAccess(req.user, req.body?.serviceId);
      const token = await findByRef(req.body?.serviceId, req.body?.ref);
      if (path === 'check-in' && !ACTIVE_STATUSES.includes(token.status)) {
        throw new HttpError(409, `${token.label} is ${token.status.replace('_', '-')} and cannot check in`);
      }
      const updated = await fn(token);
      res.json({ label: token.label, name: token.name, checkedIn: updated.checkedIn });
    })
  );
}

export default router;
