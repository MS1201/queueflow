import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models.js';
import { HttpError, asyncHandler } from '../utils.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '12h' });

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, config.jwtSecret);
    const user = await User.findById(payload.sub);
    return user && user.active ? user : null;
  } catch {
    return null;
  }
}

export const authOptional = asyncHandler(async (req, _res, next) => {
  req.user = await loadUser(req);
  next();
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const user = await loadUser(req);
  if (!user) throw new HttpError(401, 'Please sign in to continue');
  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have permission to do that'));

/** Staff can only touch their own service; admins can touch any. */
export function assertServiceAccess(user, serviceId) {
  if (user.role === 'admin') return;
  if (!user.service || String(user.service) !== String(serviceId)) {
    throw new HttpError(403, 'This service is not assigned to you');
  }
}
