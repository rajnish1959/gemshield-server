// Razorpay via its REST API (no SDK needed).
// Test mode: use rzp_test_... keys. Live: switch to rzp_live_... keys on Render.
import crypto from 'node:crypto';
import { config } from './config.js';

const API = 'https://api.razorpay.com/v1';

function auth() {
  if (!config.rzpKeyId || !config.rzpKeySecret) throw new Error('Server is missing Razorpay keys.');
  return 'Basic ' + Buffer.from(`${config.rzpKeyId}:${config.rzpKeySecret}`).toString('base64');
}

async function rzp(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay: ${json?.error?.description || res.status}`);
  return json;
}

export function createOrder(amountPaise, receipt, notes) {
  return rzp('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes });
}

export function fetchOrderPayments(orderId) {
  return rzp('GET', `/orders/${orderId}/payments`);
}

export function capturePayment(paymentId, amountPaise) {
  return rzp('POST', `/payments/${paymentId}/capture`, { amount: amountPaise, currency: 'INR' });
}

export function fetchPayment(paymentId) {
  return rzp('GET', `/payments/${paymentId}`);
}

/** Razorpay checkout signature = HMAC_SHA256(order_id|payment_id, key_secret). */
export function signatureOk(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', config.rzpKeySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Double-checks a payment with Razorpay itself: right order, right amount,
 * and money actually taken (captures it if only authorised).
 */
export async function confirmPayment(payment, orderId, amountPaise) {
  if (!payment || payment.order_id !== orderId || Number(payment.amount) !== Number(amountPaise)) return false;
  if (payment.status === 'captured') return true;
  if (payment.status === 'authorized') {
    const cap = await capturePayment(payment.id, amountPaise);
    return cap?.status === 'captured';
  }
  return false;
}
