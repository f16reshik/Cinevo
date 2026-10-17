import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { defaultLayout, seatsFromLayout } from '../src/services/seats.js';

const prisma = new PrismaClient();
const hash = (p) => bcrypt.hash(p, 10);

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cinevo.local').toLowerCase();
  await prisma.user.upsert({
    where: { email: adminEmail }, update: {},
    create: { name: 'Admin', email: adminEmail, passwordHash: await hash(process.env.ADMIN_PASSWORD || 'Admin@12345'), role: 'ADMIN', verified: true },
  });
  for (const name of ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune']) {
    await prisma.city.upsert({ where: { name }, update: {}, create: { name } });
  }
  if ((await prisma.event.count()) > 0) return console.log('Seed: demo data already present');

  const staff = await prisma.user.upsert({
    where: { email: 'staff@demo.com' }, update: {},
    create: { name: 'Demo Staff', email: 'staff@demo.com', passwordHash: await hash('Staff@12345'), role: 'STAFF', verified: true },
  });
  const delhi = await prisma.city.findUnique({ where: { name: 'Delhi' } });
  const venue = await prisma.venue.create({ data: { name: 'Cinevo Cinemas', address: 'Connaught Place', cityId: delhi.id, managerId: staff.id } });
  const layout = await prisma.seatLayout.create({ data: { name: 'Standard 6x12', layout: defaultLayout, ownerId: staff.id } });
  const screen = await prisma.screen.create({ data: { name: 'Screen 1', venueId: venue.id, layoutId: layout.id } });
  const event = await prisma.event.create({
    data: { title: 'Demo Movie', description: 'A seeded movie so you can try booking right away.', durationMin: 120, genre: 'Drama', language: 'English', rating: 'UA', status: 'PUBLISHED', createdById: staff.id },
  });
  const prices = { PREMIUM: 350, REGULAR: 200 };
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(19, 0, 0, 0);
  const show = await prisma.show.create({ data: { eventId: event.id, screenId: screen.id, startsAt: start } });
  await prisma.pricingTier.createMany({ data: Object.entries(prices).map(([category, price]) => ({ showId: show.id, category, price })) });
  await prisma.showSeat.createMany({ data: seatsFromLayout(defaultLayout, prices, show.id) });
  console.log('Seed: created demo staff (staff@demo.com), venue, event and show');
}

main().finally(() => prisma.$disconnect());
