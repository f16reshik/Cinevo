import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, toInt } from '../middleware.js';

const r = Router();

r.get('/cities', async (req, res) => res.json(await prisma.city.findMany({ orderBy: { name: 'asc' } })));

r.get('/events', async (req, res) => {
  const { cityId, q, genre, language, type } = req.query;
  const where = {
    status: 'PUBLISHED',
    ...(q && { title: { contains: String(q), mode: 'insensitive' } }),
    ...(genre && { genre: String(genre) }),
    ...(language && { language: String(language) }),
    ...(type && { type: String(type) }),
    shows: {
      some: {
        cancelled: false,
        startsAt: { gt: new Date() },
        ...(cityId && { screen: { venue: { cityId: toInt(cityId, 'cityId') } } }),
      },
    },
  };
  res.json(await prisma.event.findMany({ where, orderBy: { createdAt: 'desc' }, take: 60 }));
});

r.get('/events/:id', async (req, res) => {
  const id = toInt(req.params.id);
  const event = await prisma.event.findFirst({ where: { id, status: 'PUBLISHED' } });
  if (!event) throw new HttpError(404, 'Event not found');
  const cityId = req.query.cityId ? toInt(req.query.cityId, 'cityId') : null;
  const shows = await prisma.show.findMany({
    where: { eventId: id, cancelled: false, startsAt: { gt: new Date() }, ...(cityId && { screen: { venue: { cityId } } }) },
    orderBy: { startsAt: 'asc' },
    include: { tiers: true, screen: { include: { venue: { include: { city: true } } } } },
  });
  const counts = await prisma.showSeat.groupBy({
    by: ['showId'],
    where: { showId: { in: shows.map((s) => s.id) }, status: 'AVAILABLE' },
    _count: true,
  });
  const avail = Object.fromEntries(counts.map((c) => [c.showId, c._count]));
  res.json({ event, shows: shows.map((s) => ({ ...s, available: avail[s.id] || 0 })) });
});

// Seat map. A LOCKED seat whose lock has expired is reported as AVAILABLE.
r.get('/shows/:id', async (req, res) => {
  const id = toInt(req.params.id);
  const show = await prisma.show.findUnique({
    where: { id },
    include: { event: true, tiers: true, screen: { include: { venue: { include: { city: true } } } } },
  });
  if (!show || show.cancelled || show.event.status !== 'PUBLISHED') throw new HttpError(404, 'Show not found');
  const seats = await prisma.showSeat.findMany({
    where: { showId: id },
    orderBy: [{ row: 'asc' }, { number: 'asc' }],
    select: { id: true, row: true, number: true, category: true, price: true, status: true, lockedUntil: true },
  });
  const now = new Date();
  res.json({
    show,
    seats: seats.map(({ lockedUntil, ...s }) => ({
      ...s,
      status: s.status === 'LOCKED' && lockedUntil < now ? 'AVAILABLE' : s.status,
    })),
  });
});

export default r;
