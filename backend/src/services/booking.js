import { prisma, Prisma } from '../db.js';
import { HttpError } from '../middleware.js';
import { refundPayment } from './payment.js';

export const LOCK_MINUTES = 8;
const CANCEL_CUTOFF_HOURS = 2;

class Rollback extends Error {}

const releaseSeats = (tx, orderId) =>
  tx.showSeat.updateMany({
    where: { orderId, status: { in: ['LOCKED', 'BOOKED'] } },
    data: { status: 'AVAILABLE', orderId: null, lockedUntil: null },
  });

// Atomically lock seats and create a PENDING order. The single UPDATE ... WHERE is what prevents double booking:
// Postgres row locks make a concurrent buyer wait, then re-check the WHERE and match zero rows.
export async function createOrder(userId, showId, seatIds) {
  const show = await prisma.show.findUnique({ where: { id: showId }, include: { event: true } });
  if (!show || show.cancelled || show.event.status !== 'PUBLISHED') throw new HttpError(404, 'Show not available');
  if (show.startsAt <= new Date()) throw new HttpError(400, 'Show has already started');

  const expiresAt = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { userId, showId, expiresAt } });
      const locked = await tx.$executeRaw`
        UPDATE "ShowSeat"
        SET status = 'LOCKED', "lockedUntil" = ${expiresAt}, "orderId" = ${order.id}
        WHERE "showId" = ${showId}
          AND id IN (${Prisma.join(seatIds)})
          AND (status = 'AVAILABLE' OR (status = 'LOCKED' AND "lockedUntil" < NOW()))`;
      if (locked !== seatIds.length) throw new Rollback();
      const seats = await tx.showSeat.findMany({ where: { id: { in: seatIds } } });
      await tx.orderItem.createMany({ data: seats.map((s) => ({ orderId: order.id, showSeatId: s.id, price: s.price })) });
      const total = seats.reduce((a, s) => a + s.price, 0);
      return tx.order.update({ where: { id: order.id }, data: { totalAmount: total } });
    });
  } catch (e) {
    if (e instanceof Rollback) throw new HttpError(409, 'Some of those seats were just taken. Please pick again.');
    throw e;
  }
}

// Idempotent: called from both the browser verify call and the gateway webhook.
export async function confirmOrder(orderId, { gatewayOrderId, gatewayPaymentId, payload }) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new HttpError(404, 'Order not found');
      if (order.status === 'CONFIRMED') return order;

      const ids = order.items.map((i) => i.showSeatId);
      if (order.status === 'EXPIRED') {
        // Payment landed after the lock expired: try to grab the seats back.
        await tx.$executeRaw`
          UPDATE "ShowSeat" SET status = 'LOCKED', "orderId" = ${orderId}
          WHERE id IN (${Prisma.join(ids)}) AND status = 'AVAILABLE'`;
      } else if (order.status !== 'PENDING') throw new Rollback();

      const { count } = await tx.showSeat.updateMany({
        where: { id: { in: ids }, orderId, status: 'LOCKED' },
        data: { status: 'BOOKED', lockedUntil: null },
      });
      if (count !== ids.length) throw new Rollback();

      await tx.payment.update({
        where: { gatewayOrderId },
        data: { status: 'PAID', gatewayPaymentId, rawPayload: payload ?? undefined },
      });
      await tx.ticket.createMany({ data: ids.map((showSeatId) => ({ orderId, showSeatId })) });
      return tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    // Money was taken but seats can't be given: mark failed and refund automatically.
    await prisma.payment.update({
      where: { gatewayOrderId },
      data: { status: 'PAID', gatewayPaymentId, rawPayload: payload ?? undefined },
    });
    await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
    await refundOrder(orderId, 'Seats no longer available after payment');
    throw new HttpError(409, 'Seats were no longer available. Your payment has been refunded.');
  }
}

async function refundOrder(orderId, reason) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  const payment = order.payments.find((p) => p.status === 'PAID');
  if (!payment) return null;
  let status = 'PROCESSED', gatewayRef = null;
  try {
    gatewayRef = (await refundPayment(payment.gatewayPaymentId, order.totalAmount)).id;
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
  } catch (e) {
    console.error('refund failed', e.message);
    status = 'FAILED'; // admin can see it in the refunds list and retry from the gateway dashboard
  }
  return prisma.refund.create({
    data: { orderId, paymentId: payment.id, amount: order.totalAmount, status, reason, gatewayRef },
  });
}

export async function cancelOrder(orderId, user) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { show: true } });
  if (!order || order.userId !== user.id) throw new HttpError(404, 'Order not found');

  if (order.status === 'PENDING') {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      if (count) await releaseSeats(tx, orderId);
    });
    return { status: 'CANCELLED' };
  }
  if (order.status !== 'CONFIRMED') throw new HttpError(400, `Cannot cancel an order that is ${order.status.toLowerCase()}`);

  const hoursLeft = (order.show.startsAt - Date.now()) / 36e5;
  if (hoursLeft < CANCEL_CUTOFF_HOURS) throw new HttpError(400, `Cancellations close ${CANCEL_CUTOFF_HOURS} hours before the show`);

  const flipped = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: 'CONFIRMED' }, data: { status: 'REFUNDED' } });
    if (!count) return false;
    await tx.ticket.updateMany({ where: { orderId, status: 'VALID' }, data: { status: 'CANCELLED' } });
    await releaseSeats(tx, orderId);
    return true;
  });
  if (!flipped) throw new HttpError(409, 'Order was already cancelled');
  const refund = await refundOrder(orderId, 'Cancelled by customer');
  return { status: 'REFUNDED', refund };
}

export async function expireStaleOrders() {
  const stale = await prisma.order.findMany({ where: { status: 'PENDING', expiresAt: { lt: new Date() } }, select: { id: true } });
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (count) await releaseSeats(tx, id);
    });
  }
  return stale.length;
}
