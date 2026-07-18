// Shared helpers for the AdVault k6 load tests (docs/17 §6).
// The API is same-origin in prod; point API_URL at the API root (…/api/v1).
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';

export const API_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
// Must match the running API's PAYMENT_WEBHOOK_SECRET for the top-up webhook.
export const WEBHOOK_SECRET =
  __ENV.PAYMENT_WEBHOOK_SECRET || 'advault-dev-webhook-secret-change-me';

function json(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

/** Register a fresh customer and return their access token. */
export function register(suffix) {
  const email = `load-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}@load.test`;
  const res = http.post(
    `${API_URL}/auth/register`,
    JSON.stringify({ email, password: 'Password123!' }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
  check(res, { 'register 2xx': (r) => r.status >= 200 && r.status < 300 });
  const body = json(res);
  return body && body.accessToken;
}

/** Credit `amount` to the caller's balance via a top-up + signed sandbox webhook. */
export function topUp(token, amount) {
  const create = http.post(
    `${API_URL}/wallet/topups`,
    JSON.stringify({ amount: String(amount), asset: 'USDT-TRC20' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': `topup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    },
  );
  const topup = json(create);
  // The acquirer's externalId is not exposed as a field; it is the last path
  // segment of the sandbox paymentUrl (…/sbx_<uuid>). A real provider knows it
  // and sends the webhook itself — here we replay it to credit balance.
  const externalId = topup && topup.paymentUrl && topup.paymentUrl.split('/').pop();
  if (!externalId) return false;

  // The webhook signature is HMAC-SHA256(rawBody) hex over the exact bytes.
  const rawBody = JSON.stringify({ externalId, status: 'paid' });
  const signature = crypto.hmac('sha256', WEBHOOK_SECRET, rawBody, 'hex');
  const hook = http.post(`${API_URL}/webhooks/payments/sandbox`, rawBody, {
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
  });
  return check(hook, { 'topup webhook 200': (r) => r.status === 200 });
}

/** Add a variant to the cart. */
export function addToCart(token, variantId, quantity = 1) {
  const res = http.post(`${API_URL}/cart/items`, JSON.stringify({ variantId, quantity }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  return check(res, { 'cart add 2xx': (r) => r.status >= 200 && r.status < 300 });
}

/** Checkout with an explicit Idempotency-Key; returns the parsed response + status. */
export function checkout(token, idempotencyKey) {
  const res = http.post(`${API_URL}/orders/checkout`, JSON.stringify({}), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
  });
  return { status: res.status, body: json(res), res };
}

/** Current wallet balance (string) for teardown assertions. */
export function balance(token) {
  const res = http.get(`${API_URL}/wallet`, { headers: { Authorization: `Bearer ${token}` } });
  const body = json(res);
  return body && body.balance;
}
