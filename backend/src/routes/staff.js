import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, auth, role, toInt, audit } from '../middleware.js';
import { validateLayout, seatsFromLayout } from '../services/seats.js';

const r = Router();
r.use(auth, role('STAFF', 'ADMIN'));

const str = (v, n, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new HttpError(400, `${n} is required`);
  return v.trim();
};

// ---- venues & screens ----
r.get('/venues', async (req, res) =>
  res.json(await prisma.venue.findMany({ where: { managerId: req.user.id }, include: { city: true, screens: { include: { layout: true } } } })));

r.post('/venues', async (req, res) => {
  const cityId = toInt(req.body?.cityId, 'cityId');
  if (!(await prisma.city.findUnique({ where: { id: cityId } }))) throw new HttpError(400, 'Unknown city');
  const v = await prisma.venue.create({ data: { name: str(req.body.name, 'name'), address: str(req.body.address, 'address'), cityId, managerId: req.user.id } });
  audit(req.user.id, 'VENUE_CREATE', 'Venue', v.id);
  res.status(201).json(v);
});

r.post('/screens', async (req, res) => {
  const venueId = toInt(req.body?.venueId, 'venueId');
  const venue = await prisma.venue.findFirst({ where: { id: venueId, managerId: req.user.id } });
  if (!venue) throw new HttpError(404, 'Venue not found');
  const layoutJson = req.body.layout;
  validateLayout(layoutJson);
  const name = str(req.body.name, 'name');
  const screen = await prisma.$transaction(async (tx) => {
    const layout = await tx.seatLayout.create({ data: { name: `${venue.name} - ${name}`, layout: layoutJson, ownerId: req.user.id } });
    return tx.screen.create({ data: { name, venueId, layoutId: layout.id } });
  });
  audit(req.user.id, 'SCREEN_CREATE', 'Screen', screen.id);
  res.status(201).json(screen);
});

// ---- events ----
r.get('/events', async (req, res) => res.json(await prisma.event.findMany({ where: { createdById: req.user.id }, orderBy: { createdAt: 'desc' } })));

r.post('/events', async (req, res) => {
  const b = req.body || {};
  const durationMin = toInt(b.durationMin, 'durationMin');
  if (durationMin < 15 || durationMin > 600) throw new HttpError(400, 'Duration must be 15-600 minutes');
  const e = await prisma.event.create({
    data: {
      title: str(b.title, 'title'), description: String(b.description || '').slice(0, 2000), type: b.type === 'EVENT' ? 'EVENT' : 'MOVIE',
      durationMin, language: String(b.language || 'English').slice(0, 40), genre: String(b.genre || 'General').slice(0, 40),
      rating: String(b.rating || 'U').slice(0, 10), posterUrl: String(b.posterUrl || '').slice(0, 500),
      status: b.draft ? 'DRAFT' : 'PENDING_APPROVAL', createdById: req.user.id,
    },
  });
  audit(req.user.id, 'EVENT_CREATE', 'Event', e.id, { status: e.status });
  res.status(201).json(e);
});

r.post('/events/:id/submit', async (req, res) => {
  const { count } = await prisma.event.updateMany({ where: { id: toInt(req.params.id), createdById: req.user.id, status: 'DRAFT' }, data: { status: 'PENDING_APPROVAL' } });
  if (!count) throw new HttpError(400, 'Only your draft events can be submitted');
  audit(req.user.id, 'EVENT_SUBMIT', 'Event', req.params.id);
  res.json({ ok: true });
});

// ---- shows ----
r.get('/shows', async (req, res) =>
  res.json(await prisma.show.findMany({
    where: { screen: { venue: { managerId: req.user.id } } }, orderBy: { startsAt: 'desc' }, take: 100,
    include: { event: { select: { title: true, status: true } }, screen: { include: { venue: true } }, tiers: true },
  })));

r.post('/shows', async (req, res) => {
  const b = req.body || {};
  const eventId = toInt(b.eventId, 'eventId'), screenId = toInt(b.screenId, 'screenId');
  const event = await prisma.event.findFirst({ where: { id: eventId, createdById: req.user.id } });
  if (!event || event.status === 'CANCELLED') throw new HttpError(404, 'Event not found');
  const screen = await prisma.screen.findFirst({ where: { id: screenId, venue: { managerId: req.user.id } }, include: { layout: true } });
  if (!screen) throw new HttpError(404, 'Screen not found');

  const start = new Date(b.startsAt);
  if (isNaN(start) || start <= new Date()) throw new HttpError(400, 'startsAt must be a future date-time');
  const end = new Date(start.getTime() + (event.durationMin + 15) * 60000);
  const near = await prisma.show.findMany({
    where: { screenId, cancelled: false, startsAt: { gte: new Date(start.getTime() - 12 * 36e5), lt: end } }, include: { event: true },
  });
  if (near.some((s) => s.startsAt < end && s.startsAt.getTime() + (s.event.durationMin + 15) * 60000 > start.getTime()))
    throw new HttpError(409, 'This screen already has a show overlapping that time');

  const cats = validateLayout(screen.layout.layout);
  const prices = {};
  for (const c of cats) {
    const p = Number(b.tiers?.[c]);
    if (!Number.isInteger(p) || p < 0 || p > 100000) throw new HttpError(400, `Price required for category ${c}`);
    prices[c] = p;
  }
  const show = await prisma.$transaction(async (tx) => {
    const s = await tx.show.create({ data: { eventId, screenId, startsAt: start } });
    await tx.pricingTier.createMany({ data: cats.map((category) => ({ showId: s.id, category, price: prices[category] })) });
    await tx.showSeat.createMany({ data: seatsFromLayout(screen.layout.layout, prices, s.id) });
    return s;
  });
  audit(req.user.id, 'SHOW_CREATE', 'Show', show.id);
  res.status(201).json(show);
});

r.get('/shows/:id/stats', async (req, res) => {
  const id = toInt(req.params.id);
  const show = await prisma.show.findFirst({ where: { id, screen: { venue: { managerId: req.user.id } } } });
  if (!show) throw new HttpError(404, 'Show not found');
  const groups = await prisma.showSeat.groupBy({ by: ['status'], where: { showId: id }, _count: true, _sum: { price: true } });
  const by = (s) => groups.find((g) => g.status === s);
  const used = await prisma.ticket.count({ where: { status: 'USED', order: { showId: id } } });
  res.json({
    total: groups.reduce((a, g) => a + g._count, 0),
    available: by('AVAILABLE')?._count || 0, locked: by('LOCKED')?._count || 0, booked: by('BOOKED')?._count || 0,
    revenue: by('BOOKED')?._sum.price || 0, checkedIn: used,
  });
});

// ---- entry validation ----
r.post('/validate', async (req, res) => {
  const code = str(req.body?.code, 'code', 100);
  const t = await prisma.ticket.findUnique({
    where: { code },
    include: { showSeat: true, order: { include: { show: { include: { event: true, screen: { include: { venue: true } } } } } } },
  });
  if (!t) throw new HttpError(404, 'Invalid ticket');
  const show = t.order.show;
  if (req.user.role !== 'ADMIN' && show.screen.venue.managerId !== req.user.id) throw new HttpError(403, 'Ticket is for a different venue');
  const info = { event: show.event.title, screen: show.screen.name, startsAt: show.startsAt, seat: `${t.showSeat.row}${t.showSeat.number}` };
  if (t.status === 'CANCELLED') throw new HttpError(410, 'Ticket was cancelled/refunded');
  // Atomic check-in: only one scan can flip VALID -> USED.
  const { count } = await prisma.ticket.updateMany({ where: { id: t.id, status: 'VALID' }, data: { status: 'USED', usedAt: new Date() } });
  if (!count) return res.status(409).json({ error: `Already used at ${t.usedAt?.toLocaleString() || 'earlier'}`, ...info });
  audit(req.user.id, 'TICKET_CHECKIN', 'Ticket', t.id);
  res.json({ ok: true, ...info });
});

export default r;
