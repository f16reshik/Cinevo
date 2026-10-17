import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, auth, role, toInt, audit } from '../middleware.js';

const r = Router();
r.use(auth, role('ADMIN'));

r.get('/users', async (req, res) => {
  const { role: rl, status } = req.query;
  res.json(await prisma.user.findMany({
    where: { ...(rl && { role: String(rl) }), ...(status && { status: String(status) }) },
    orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  }));
});

r.patch('/users/:id/status', async (req, res) => {
  const id = toInt(req.params.id), status = req.body?.status;
  if (!['ACTIVE', 'REJECTED', 'SUSPENDED'].includes(status)) throw new HttpError(400, 'Bad status');
  if (id === req.user.id) throw new HttpError(400, 'You cannot change your own status');
  const u = await prisma.user.update({ where: { id }, data: { status, verified: status === 'ACTIVE' } });
  audit(req.user.id, `USER_${status}`, 'User', id);
  res.json({ id: u.id, status: u.status });
});

r.get('/events', async (req, res) =>
  res.json(await prisma.event.findMany({
    where: req.query.status ? { status: String(req.query.status) } : {}, orderBy: { createdAt: 'desc' }, take: 200,
    include: { createdBy: { select: { name: true, email: true } } },
  })));

// Approve (PUBLISHED), reject (DRAFT) or take down (CANCELLED).
r.patch('/events/:id/status', async (req, res) => {
  const id = toInt(req.params.id), status = req.body?.status;
  if (!['PUBLISHED', 'DRAFT', 'CANCELLED'].includes(status)) throw new HttpError(400, 'Bad status');
  const e = await prisma.event.update({ where: { id }, data: { status } });
  audit(req.user.id, `EVENT_${status}`, 'Event', id, { reason: req.body?.reason });
  res.json(e);
});

r.post('/cities', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(400, 'City name required');
  const c = await prisma.city.upsert({ where: { name }, update: {}, create: { name } });
  audit(req.user.id, 'CITY_CREATE', 'City', c.id);
  res.status(201).json(c);
});

r.get('/stats', async (req, res) => {
  const [users, confirmed, revenue, refunds, topEvents] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.order.count({ where: { status: 'CONFIRMED' } }),
    prisma.order.aggregate({ where: { status: 'CONFIRMED' }, _sum: { totalAmount: true } }),
    prisma.refund.aggregate({ where: { status: 'PROCESSED' }, _sum: { amount: true }, _count: true }),
    prisma.$queryRaw`SELECT e.title, SUM(o."totalAmount")::int AS revenue, COUNT(o.id)::int AS orders
                     FROM "Order" o JOIN "Show" s ON s.id = o."showId" JOIN "Event" e ON e.id = s."eventId"
                     WHERE o.status = 'CONFIRMED' GROUP BY e.title ORDER BY revenue DESC LIMIT 5`,
  ]);
  res.json({
    users: Object.fromEntries(users.map((u) => [u.role, u._count])),
    confirmedOrders: confirmed, netRevenue: revenue._sum.totalAmount || 0,
    refundedAmount: refunds._sum.amount || 0, refundCount: refunds._count, topEvents,
  });
});

r.get('/refunds', async (req, res) =>
  res.json(await prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { order: { select: { id: true, user: { select: { email: true } } } } } })));

r.get('/audit', async (req, res) =>
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 150, include: { actor: { select: { email: true, role: true } } } })));

export default r;
