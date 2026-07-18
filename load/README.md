# Load tests (k6) — AdVault

Load/soak scenarios for the money-critical paths before launch (docs/17 §6).
They exercise exactly the bottlenecks the runbook flags: the **Redis stock
reservation** and **`LedgerService.debit` inside the checkout transaction**, plus
the **idempotency guard** that must hold under concurrency.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed (`k6 version`).
- A running API + Postgres + Redis (staging, or `docker compose up`).
- A seeded **READY_STOCK** product variant with enough stock for the run
  (`prisma/seed.ts` seeds catalog; import stock via
  `POST /admin/products/:id/variants/:variantId/stock/import`).
- The API's `PAYMENT_WEBHOOK_SECRET` (the top-up helper signs the sandbox
  webhook with it to credit balance).

## Scenarios

| File | What it proves | Executor |
|------|----------------|----------|
| `checkout.js` | Sustained purchase throughput; p95 checkout latency and error rate stay within thresholds under ramping load. | ramping-vus (0→20→0) |
| `idempotency.js` | 30 concurrent checkouts with the **same** `Idempotency-Key` collapse to a single order and **one** balance debit — no double-spend. | shared-iterations |

## Running

```bash
# Throughput
k6 run \
  -e API_URL=https://staging.advault.example.com/api/v1 \
  -e VARIANT_ID=<ready-stock-variant-uuid> \
  -e PAYMENT_WEBHOOK_SECRET=<secret> \
  load/checkout.js

# Idempotency under concurrency (UNIT_PRICE = the seeded variant's price)
k6 run \
  -e API_URL=https://staging.advault.example.com/api/v1 \
  -e VARIANT_ID=<ready-stock-variant-uuid> \
  -e UNIT_PRICE=10 \
  -e PAYMENT_WEBHOOK_SECRET=<secret> \
  load/idempotency.js
```

## Thresholds (fail the run when breached)

- `checkout.js`: `checks rate>0.99`, `checkout_duration p95<1500ms`,
  `http_req_failed rate<0.02`.
- `idempotency.js`: all checks pass **and** teardown asserts
  `balance == TOPUP − UNIT_PRICE` (debited exactly once); otherwise it throws.

## Interpreting results & known bottlenecks

- **Stock reservation (Redis TTL):** contention here shows as rising
  `checkout_duration` p95 while error rate stays low — the reserve/sweep is
  serializing. Scale Redis / tune `STOCK_RESERVE_TTL_SECONDS`.
- **Ledger debit (DB tx):** `OUT_OF_STOCK`/`INSUFFICIENT_BALANCE` are correct
  business rejections, not errors — check them against the seeded stock/balance,
  not the failure threshold.
- **Idempotency:** any second order id or a balance below `TOPUP − UNIT_PRICE`
  means the dedup broke — treat as a release blocker.
