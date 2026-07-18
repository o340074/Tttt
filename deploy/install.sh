#!/usr/bin/env bash
# AdVault one-shot installer (plain HTTP, most robust). Installs Docker if
# needed, generates .env with fresh secrets on first run, builds + starts the
# stack, applies migrations, seeds demo users, then prints a clear PASS/FAIL
# summary with diagnostics. Safe to re-run.
#
#   cd /opt/advault && git pull && bash deploy/install.sh
set -uo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"

line() { printf '%s\n' "-----------------------------------------------------------"; }

# 1. Docker -----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

# 2. Public IP (for URLs) ---------------------------------------------------
IP="$(curl -s --max-time 5 ifconfig.me || true)"
[ -z "$IP" ] && IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$IP" ] && IP="<server-ip>"

# 3. .env (generate once with strong secrets) -------------------------------
if [ ! -f .env ]; then
  echo "==> Generating .env"
  cp .env.example .env
  PG="$(openssl rand -hex 16)"
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://advault:${PG}@postgres:5432/advault?schema=public#" .env
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${PG}#" .env
  sed -i "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=$(openssl rand -hex 32)#" .env
  sed -i "s#^JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=$(openssl rand -hex 32)#" .env
  sed -i "s#^PAYMENT_WEBHOOK_SECRET=.*#PAYMENT_WEBHOOK_SECRET=$(openssl rand -hex 32)#" .env
  sed -i "s#^PAYLOAD_ENCRYPTION_KEY=.*#PAYLOAD_ENCRYPTION_KEY=v1:$(openssl rand -base64 32)#" .env
  sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=http://${IP}#" .env
  sed -i "s#^WEB_URL=.*#WEB_URL=http://${IP}#" .env
fi

# 4. Make sure the TLS variant isn't holding the ports -----------------------
docker compose -f deploy/docker-compose.tls.yml down 2>/dev/null || true

# 5. Build + start ----------------------------------------------------------
echo "==> Building images (first run takes a few minutes)"
$COMPOSE build || { echo "BUILD FAILED"; exit 1; }
echo "==> Starting datastores"
$COMPOSE up -d postgres redis
sleep 5
echo "==> Applying migrations"
$COMPOSE run --rm api pnpm --filter @advault/api exec prisma migrate deploy
echo "==> Seeding demo users"
$COMPOSE run --rm api pnpm --filter @advault/api db:seed || true
echo "==> Starting API + web"
$COMPOSE up -d api web

# 6. Open the HOST firewall for 80/443 (best-effort; the cloud provider's
#    security-group is separate and can only be opened in their web panel) ----
echo "==> Opening host firewall for 80/443"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  echo "   ufw: allowed 80,443"
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80  -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  { iptables-save > /etc/iptables/rules.v4; } 2>/dev/null || netfilter-persistent save 2>/dev/null || true
  echo "   iptables: allowed 80,443"
fi

# 7. Diagnose ---------------------------------------------------------------
sleep 6
line; echo "CONTAINERS:"; $COMPOSE ps
line; echo "API HEALTH (through nginx on :80):"
curl -s -m 8 -o /dev/null -w "  http://localhost/api/v1/health -> HTTP %{http_code}\n" http://localhost/api/v1/health || echo "  nginx not answering on :80"
echo "WEB INDEX:"
curl -s -m 8 -o /dev/null -w "  http://localhost/ -> HTTP %{http_code}\n" http://localhost/ || echo "  nginx not answering on :80"
line
API_STATE="$($COMPOSE ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep '^api ' || true)"
if ! echo "$API_STATE" | grep -q running; then
  echo "API is NOT running — last 40 log lines:"; $COMPOSE logs --tail=40 api
  line
fi

echo
echo "==========================================================="
echo "  OPEN IN BROWSER:   http://${IP}/auth"
echo "  LOGIN:             admin@advault.dev / advault-dev-password"
echo "==========================================================="
echo "If the browser still can't reach it but the checks above show HTTP 200,"
echo "the problem is the CLOUD FIREWALL: open inbound TCP port 80 (and 443)"
echo "in your provider's security-group / firewall panel."
