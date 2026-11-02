import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../models.js';
import { HttpError, asyncHandler } from '../utils.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) throw new HttpError(400, 'Enter your email and password');
    const user = await User.findOne({ email }).select('+passwordHash').populate('service', 'name code');
    if (!user || !user.active || !(await user.verifyPassword(password))) {
      throw new HttpError(401, 'Email or password is incorrect');
    }
    res.json({ token: signToken(user), user });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    await req.user.populate('service', 'name code');
    res.json({ user: req.user });
  })
);

export default router;
