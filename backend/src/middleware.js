import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const signToken = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

export async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please log in');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { throw new HttpError(401, 'Session expired, please log in again'); }
  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || user.status !== 'ACTIVE') throw new HttpError(403, 'Account is not active');
  req.user = user;
  next();
}

export const role = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden');
  next();
};

export const audit = (actorId, action, entity, entityId, meta) =>
  prisma.auditLog
    .create({ data: { actorId, action, entity, entityId: entityId != null ? String(entityId) : null, meta } })
    .catch((e) => console.error('audit failed', e.message));

export const toInt = (v, name = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, `Invalid ${name}`);
  return n;
};
