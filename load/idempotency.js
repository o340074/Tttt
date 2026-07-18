// Load test: idempotency under concurrency (docs/17 §6).
// One customer, one cart, and N virtual users firing checkout with the SAME
// Idempotency-Key at once. The contract: exactly one order is created and the
// balance is debited exactly once — every concurrent request must return the
// same order, never a second charge. This guards the ledger/stock hot path
// against double-spend on client retries or a thundering herd.
//
//   k6 run -e API_URL=http://localhost:3000/api/v1 \
//          -e VARIANT_ID=<ready-stock-variant-uuid> \
//          -e PAYMENT_WEBHOOK_SECRET=<secret> load/idempotency.js
import { check } from 'k6';
import { register, topUp, addToCart, checkout, balance } from './lib.js';

const VARIANT_ID = __ENV.VARIANT_ID;
const UNIT_PRICE = Number(__ENV.UNIT_PRICE || '10'); // seeded variant price
const TOPUP = 100;

export const options = {
  scenarios: {
    stampede: {
      executor: 'shared-iterations',
      vus: 30,
      iterations: 30, // 30 concurrent checkouts, all with the same key
      maxDuration: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
  },
};

export function setup() {
  if (!VARIANT_ID) {
    throw new Error('VARIANT_ID env is required (a seeded READY_STOCK variant with stock).');
  }
  const token = register('idem');
  if (!token) throw new Error('setup: could not register the shared customer');
  if (!topUp(token, TOPUP)) throw new Error('setup: top-up failed');
  if (!addToCart(token, VARIANT_ID, 1)) throw new Error('setup: add to cart failed');
  // One shared key for every VU — the whole point of the test.
  return { token, key: `idem-${Date.now()}` };
}

export default function (data) {
  const { status, body } = checkout(data.token, data.key);
  // Either the winner (created) or an idempotent replay — both must be 2xx and
  // carry an order id. A 5xx or a distinct second order id would be a failure.
  check(
    { status, body },
    {
      'checkout 2xx': (r) => r.status >= 200 && r.status < 300,
      'has order id': (r) => r.body && typeof r.body.id === 'string',
    },
  );
}

export function teardown(data) {
  // The decisive assertion: the balance was debited exactly once (one unit),
  // proving the 30 concurrent identical-key checkouts collapsed to a single
  // charge. Expected balance = TOPUP − UNIT_PRICE.
  const remaining = Number(balance(data.token));
  const expected = TOPUP - UNIT_PRICE;
  check(
    { remaining, expected },
    { 'debited exactly once': (r) => Math.abs(r.remaining - r.expected) < 0.001 },
  );
  if (Math.abs(remaining - expected) >= 0.001) {
    throw new Error(`Idempotency violated: balance=${remaining}, expected=${expected}`);
  }
}
