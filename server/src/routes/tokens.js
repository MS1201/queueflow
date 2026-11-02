import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { Service, Token, PRIORITIES, ACTIVE_STATUSES } from '../models.js';
import { HttpError, asyncHandler } from '../utils.js';
import { authOptional, assertServiceAccess } from '../middleware/auth.js';
import { issueToken, getTokenView, cancelToken, checkInToken, checkOutToken } from '../queueEngine.js';

const router = Router();
const issueLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

const loadToken = asyncHandler(async (req, _res, next) => {
  const token = await Token.findOne({ code: String(req.params.code || '').trim().toUpperCase() });
  if (!token) throw new HttpError(404, 'We could not find that token. Check the code and try again.');
  req.token = token;
  next();
});

router.post(
  '/',
  issueLimiter,
  authOptional,
  asyncHandler(async (req, res) => {
    const { serviceId, name, phone, priority = 'normal' } = req.body || {};
    if (!mongoose.isValidObjectId(serviceId)) throw new HttpError(400, 'Choose a service');
    const service = await Service.findById(serviceId);
    if (!service || !service.active) throw new HttpError(404, 'This service is not accepting tokens right now');

    const cleanName = String(name || '').trim().slice(0, 60);
    if (cleanName.length < 2) throw new HttpError(400, 'Enter your name (at least 2 characters)');
    const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').slice(0, 16);
    if (cleanPhone && cleanPhone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Enter a valid phone number or leave it blank');
    if (!PRIORITIES.includes(priority)) throw new HttpError(400, 'Invalid priority');

    const walkIn = req.body.walkIn === true && !!req.user;
    if (walkIn) assertServiceAccess(req.user, service._id);
    if (priority === 'emergency' && !walkIn) {
      throw new HttpError(403, 'Emergency priority is issued by staff at the counter');
    }

    if (cleanPhone) {
      const existing = await Token.findOne({ service: service._id, phone: cleanPhone, status: { $in: ACTIVE_STATUSES } });
      if (existing) {
        throw new HttpError(409, 'This phone number already has an active token for this service', { code: existing.code });
      }
    }

    const token = await issueToken(service, {
      name: cleanName,
      phone: cleanPhone,
      priority,
      source: walkIn ? 'walk_in' : 'remote',
    });
    res.status(201).json(await getTokenView(token));
  })
);

router.get('/:code', loadToken, asyncHandler(async (req, res) => res.json(await getTokenView(req.token))));

router.post(
  '/:code/cancel',
  loadToken,
  asyncHandler(async (req, res) => res.json(await getTokenView(await cancelToken(req.token))))
);
router.post(
  '/:code/check-in',
  loadToken,
  asyncHandler(async (req, res) => res.json(await getTokenView(await checkInToken(req.token))))
);
router.post(
  '/:code/check-out',
  loadToken,
  asyncHandler(async (req, res) => res.json(await getTokenView(await checkOutToken(req.token))))
);

export default router;
