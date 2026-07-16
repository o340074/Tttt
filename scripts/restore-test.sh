#!/usr/bin/env bash
# AdVault restore drill (docs/17 §4). Proves a backup is actually restorable by
# restoring it into a throwaway database on the same server, running a smoke
# check, then dropping it. Run this regularly — an untested backup is not a
# backup. Exits non-zero (and is CI/cron-alertable) if the restore fails.
#
#   Usage:  DATABASE_URL=... ./scripts/restore-test.sh <dump-file>
#           DATABASE_URL=... ./scripts/restore-test.sh          # newest in BACKUP_DIR
#   Env:    BACKUP_DIR=./backups   used to find the newest dump when none is given
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1t "$BACKUP_DIR"/advault-*.dump 2>/dev/null | head -1 || true)"
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERROR: no dump file (pass a path, or run backup.sh first)." >&2
  exit 1
fi
if [[ "$DUMP" == *.gpg ]]; then
  echo "ERROR: dump is GPG-encrypted; decrypt it first (gpg -d) and pass the .dump." >&2
  exit 1
fi

# Derive a sibling admin/test connection from DATABASE_URL (swap the db name).
# Strip Prisma's ?schema= (libpq rejects it) but keep real params like sslmode.
CLEAN_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*/\1/; s/[?&]+$//; s/\?&/?/; s/&&/\&/g')"
if [[ "$CLEAN_URL" == *\?* ]]; then
  QUERY="?${CLEAN_URL#*\?}"
  NOQ="${CLEAN_URL%%\?*}"
else
  QUERY=""
  NOQ="$CLEAN_URL"
fi
SERVER_URL="${NOQ%/*}"              # scheme://user[:pass]@host:port
TEST_DB="advault_restore_test_$$_$(date +%s)"
ADMIN_URL="$SERVER_URL/postgres$QUERY"
TEST_URL="$SERVER_URL/$TEST_DB$QUERY"

cleanup() {
  psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> creating throwaway database $TEST_DB"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TEST_DB\";" >/dev/null

echo "==> restoring $DUMP"
# --clean/--if-exists keep it idempotent; --no-owner avoids role dependencies.
pg_restore -d "$TEST_URL" --clean --if-exists --no-owner "$DUMP" >/dev/null

echo "==> smoke check: core schema present + row counts"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -tAc "SELECT to_regclass('public.users') IS NOT NULL;" \
  | grep -q '^t$' || { echo "ERROR: users table missing after restore" >&2; exit 1; }
USERS="$(psql "$TEST_URL" -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM users;')"
LEDGER="$(psql "$TEST_URL" -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM ledger_entries;')"
echo "    users=$USERS  ledger_entries=$LEDGER"

echo "==> restore-test PASSED (backup is restorable)"
