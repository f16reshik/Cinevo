import crypto from 'crypto';
import { HttpError } from '../middleware.js';

const KEY = () => process.env.RAZORPAY_KEY_ID;
const SECRET = () => process.env.RAZORPAY_KEY_SECRET;
export const gatewayMode = () => (KEY() && SECRET() ? 'razorpay' : 'mock');

async function rzp(path, body) {
  const res = await fetch('https://api.razorpay.com/v1' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${KEY()}:${SECRET()}`).toString('base64'),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, data?.error?.description || 'Payment gateway error');
  return data;
}

export async function createGatewayOrder(order) {
  if (gatewayMode() === 'mock') return { id: `mock_order_${order.id}_${Date.now()}` };
  return rzp('/orders', { amount: order.totalAmount * 100, currency: 'INR', receipt: `order_${order.id}` });
}

const safeEqual = (a, b) => {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', SECRET()).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

export async function refundPayment(gatewayPaymentId, amountRupees) {
  if (gatewayMode() === 'mock') return { id: `mock_refund_${Date.now()}` };
  return rzp(`/payments/${gatewayPaymentId}/refund`, { amount: amountRupees * 100 });
}
