import { Router } from 'express';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { HttpError, auth, role, toInt, audit } from '../middleware.js';
import { createOrder, cancelOrder } from '../services/booking.js';
import { createGatewayOrder, gatewayMode } from '../services/payment.js';

const r = Router();
r.use(auth, role('CUSTOMER'));

const include = {
  items: { include: { showSeat: true } },
  show: { include: { event: true, screen: { include: { venue: true } } } },
};

async function withQr(order) {
  const tickets = await prisma.ticket.findMany({ where: { orderId: order.id }, include: { showSeat: true } });
  return {
    ...order,
    tickets: await Promise.all(tickets.map(async (t) => ({ ...t, qr: await QRCode.toDataURL(t.code, { margin: 1, width: 220 }) }))),
  };
}

r.post('/', async (req, res) => {
  const showId = toInt(req.body?.showId, 'showId');
  const seatIds = [...new Set((req.body?.seatIds || []).map((x) => toInt(x, 'seatId')))];
  if (seatIds.length < 1 || seatIds.length > 6) throw new HttpError(400, 'Choose 1 to 6 seats');
  const order = await createOrder(req.user.id, showId, seatIds);
  res.status(201).json(order);
});

r.get('/', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id, status: { not: 'PENDING' } },
    orderBy: { createdAt: 'desc' },
    include,
  });
  res.json(await Promise.all(orders.map((o) => (o.status === 'CONFIRMED' ? withQr(o) : o))));
});

r.get('/:id', async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: toInt(req.params.id), userId: req.user.id }, include });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json(order.status === 'CONFIRMED' ? await withQr(order) : order);
});

r.post('/:id/pay', async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: toInt(req.params.id), userId: req.user.id } });
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status !== 'PENDING' || order.expiresAt < new Date()) throw new HttpError(410, 'This checkout has expired. Please pick seats again.');
  const g = await createGatewayOrder(order);
  await prisma.payment.create({ data: { orderId: order.id, gatewayOrderId: g.id, amount: order.totalAmount } });
  res.json({ mode: gatewayMode(), gatewayOrderId: g.id, amount: order.totalAmount, keyId: process.env.RAZORPAY_KEY_ID || null });
});

r.post('/:id/cancel', async (req, res) => {
  const out = await cancelOrder(toInt(req.params.id), req.user);
  audit(req.user.id, 'ORDER_CANCEL', 'Order', req.params.id, out);
  res.json(out);
});

export default r;
