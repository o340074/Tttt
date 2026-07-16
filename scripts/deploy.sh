#!/usr/bin/env bash
# AdVault production deploy (docs/17 §5). Runs the CI gate, applies forward-only
# migrations, then builds and starts the prod compose stack, gated on a green
# health check. Idempotent — safe to re-run for a rolling update.
#
#   Usage:  ./scripts/deploy.sh
#   Env:    SKIP_CI=1   skip lint/typecheck/test/build (e.g. CI already ran it)
#
# Migrations are forward-only (prisma migrate deploy). To roll back, restore
# from backup (scripts/backup.sh) and redeploy the previous image.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

# 1. Preconditions ----------------------------------------------------------
if [[ ! -f .env ]]; then
  echo "ERROR: .env is missing. Copy .env.example to .env and fill real secrets." >&2
  exit 1
fi

# 2. CI gate (lint · typecheck · test · build) ------------------------------
if [[ "${SKIP_CI:-0}" != "1" ]]; then
  echo "==> CI gate: install + lint + typecheck + test + build"
  pnpm install --frozen-lockfile
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
else
  echo "==> SKIP_CI=1 — skipping the CI gate"
fi

# 3. Build images -----------------------------------------------------------
echo "==> Building images"
$COMPOSE build

# 4. Datastores up, then forward-only migrations ----------------------------
echo "==> Starting datastores"
$COMPOSE up -d postgres redis

echo "==> Applying migrations (prisma migrate deploy)"
$COMPOSE run --rm api pnpm --filter @advault/api exec prisma migrate deploy

# 5. Start the app ----------------------------------------------------------
echo "==> Starting API + web"
$COMPOSE up -d api web

# 6. Health gate ------------------------------------------------------------
echo "==> Waiting for API health"
for _ in $(seq 1 30); do
  if $COMPOSE exec -T api node -e "fetch('http://localhost:3000/api/v1/health').then(r=>r.json()).then(h=>process.exit(h.status==='ok'?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "==> API healthy — deploy complete"
    exit 0
  fi
  sleep 2
done

echo "ERROR: API did not become healthy in time. Check: $COMPOSE logs api" >&2
exit 1
