import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { HttpError, auth, signToken, audit } from '../middleware.js';

const r = Router();
const emailOk = (e) => typeof e === 'string' && /^\S+@\S+\.\S+$/.test(e);
const clean = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status });

async function register(req, res, role, status) {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !emailOk(email) || typeof password !== 'string' || password.length < 8)
    throw new HttpError(400, 'Name, valid email and a password of 8+ characters are required');
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw new HttpError(409, 'Email already registered');
  const user = await prisma.user.create({
    data: { name: name.trim(), email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role, status },
  });
  audit(user.id, `REGISTER_${role}`, 'User', user.id);
  if (status !== 'ACTIVE') return res.status(201).json({ pending: true, message: 'Registered. An admin must approve your account before you can log in.' });
  res.status(201).json({ token: signToken(user), user: clean(user) });
}

r.post('/register', (req, res) => register(req, res, 'CUSTOMER', 'ACTIVE'));
r.post('/register-staff', (req, res) => register(req, res, 'STAFF', 'PENDING'));

r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = typeof email === 'string' ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : null;
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) throw new HttpError(401, 'Wrong email or password');
  if (user.status === 'PENDING') throw new HttpError(403, 'Your account is awaiting admin approval');
  if (user.status !== 'ACTIVE') throw new HttpError(403, `Account ${user.status.toLowerCase()}`);
  res.json({ token: signToken(user), user: clean(user) });
});

r.get('/me', auth, (req, res) => res.json({ user: clean(req.user) }));

export default r;
