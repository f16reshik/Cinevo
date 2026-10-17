import { Router } from 'express';
import express from 'express';
import { prisma } from '../db.js';
import { HttpError, auth, role, toInt } from '../middleware.js';
import { confirmOrder } from '../services/booking.js';
import { gatewayMode, verifyCheckoutSignature, verifyWebhookSignature } from '../services/payment.js';

const r = Router();

// Gateway -> us. Needs the RAW body to verify the signature, so it uses express.raw.
r.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verifyWebhookSignature(raw, req.headers['x-razorpay-signature'])) return res.status(400).json({ error: 'Bad signature' });
  const event = JSON.parse(raw);
  if (event.event === 'payment.captured') {
    const p = event.payload.payment.entity;
    const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: p.order_id } });
    if (payment) {
      try { await confirmOrder(payment.orderId, { gatewayOrderId: p.order_id, gatewayPaymentId: p.id, payload: event }); }
      catch (e) { console.error('webhook confirm', e.message); }
    }
  }
  res.json({ ok: true }); // always 200 so the gateway doesn't retry forever
});

const json = express.json();

// Browser -> us after Razorpay checkout succeeds.
r.post('/verify', json, auth, role('CUSTOMER'), async (req, res) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (gatewayMode() !== 'razorpay') throw new HttpError(400, 'Gateway not configured');
  const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: String(razorpay_order_id) }, include: { order: true } });
  if (!payment || payment.order.userId !== req.user.id || payment.orderId !== toInt(orderId)) throw new HttpError(404, 'Payment not found');
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) throw new HttpError(400, 'Payment verification failed');
  const order = await confirmOrder(payment.orderId, { gatewayOrderId: razorpay_order_id, gatewayPaymentId: razorpay_payment_id, payload: req.body });
  res.json(order);
});

// Demo-only path used when no Razorpay keys are configured.
r.post('/mock-confirm', json, auth, role('CUSTOMER'), async (req, res) => {
  if (gatewayMode() !== 'mock') throw new HttpError(403, 'Mock payments are disabled');
  const orderId = toInt(req.body?.orderId, 'orderId');
  const payment = await prisma.payment.findFirst({ where: { orderId, order: { userId: req.user.id } }, orderBy: { id: 'desc' } });
  if (!payment) throw new HttpError(404, 'Start payment first');
  res.json(await confirmOrder(orderId, { gatewayOrderId: payment.gatewayOrderId, gatewayPaymentId: `mock_pay_${Date.now()}`, payload: { mock: true } }));
});

export default r;
