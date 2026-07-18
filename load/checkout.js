// Load test: sustained READY_STOCK purchase throughput (docs/17 §6).
// Each iteration is a full buy: fresh customer → top-up → add stock variant →
// checkout (auto-delivery). Exercises the hot paths the runbook flags: the
// Redis stock reservation and LedgerService.debit inside the checkout tx.
//
//   Seed a READY_STOCK variant with ample stock, then run:
//     k6 run -e API_URL=http://localhost:3000/api/v1 \
//            -e VARIANT_ID=<ready-stock-variant-uuid> \
//            -e PAYMENT_WEBHOOK_SECRET=<secret> load/checkout.js
import { sleep } from 'k6';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { register, topUp, addToCart, checkout } from './lib.js';

const VARIANT_ID = __ENV.VARIANT_ID;
const checkoutDuration = new Trend('checkout_duration', true);

export const options = {
  scenarios: {
    buy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 }, // ramp up
        { duration: '1m', target: 20 }, // sustain
        { duration: '15s', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // 99% of checkouts succeed; p95 latency stays reasonable.
    checks: ['rate>0.99'],
    checkout_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.02'],
  },
};

export function setup() {
  if (!VARIANT_ID) {
    throw new Error('VARIANT_ID env is required (a seeded READY_STOCK variant with stock).');
  }
  return { variantId: VARIANT_ID };
}

export default function (data) {
  const token = register(`buy-${__VU}-${__ITER}`);
  if (!token) return;
  if (!topUp(token, 100)) return;
  if (!addToCart(token, data.variantId, 1)) return;

  const key = `co-${__VU}-${__ITER}-${Date.now()}`;
  const start = Date.now();
  const { status, body } = checkout(token, key);
  checkoutDuration.add(Date.now() - start);
  check(
    { status, body },
    {
      'checkout paid': (r) => r.status < 300 && r.body && r.body.status === 'paid',
    },
  );
  sleep(1);
}
