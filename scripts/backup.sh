#!/usr/bin/env bash
# AdVault database backup (docs/17 §4). Writes a compressed, restorable custom-
# format pg_dump, optionally encrypts it at rest, and prunes old backups.
#
#   Usage:  DATABASE_URL=... ./scripts/backup.sh
#   Env:    BACKUP_DIR=./backups            where dumps are written
#           RETENTION_DAYS=14               prune dumps older than this
#           BACKUP_GPG_RECIPIENT=<key-id>   if set, encrypt the dump with GPG
#
# Store backups OFF the primary host and encrypted. The payload encryption
# key-ring (PAYLOAD_ENCRYPTION_KEY) is NOT in the DB — back it up separately,
# or encrypted secret payloads are unrecoverable (docs/17 §4).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"

# Prisma's DATABASE_URL carries ?schema=public, which libpq (pg_dump/psql) does
# not understand and rejects. Strip only that param, preserving real libpq ones
# such as sslmode. (public is the default search_path, so dropping it is safe.)
PG_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*/\1/; s/[?&]+$//; s/\?&/?/; s/&&/\&/g')"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="$BACKUP_DIR/advault-$STAMP.dump"

echo "==> pg_dump (custom format) -> $OUT"
pg_dump "$PG_URL" -Fc -f "$OUT"

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  echo "==> encrypting with GPG for $BACKUP_GPG_RECIPIENT"
  gpg --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$OUT"
  rm -f "$OUT"
  OUT="$OUT.gpg"
fi

echo "==> wrote $(du -h "$OUT" | cut -f1)  $OUT"

echo "==> pruning backups older than ${RETENTION_DAYS}d"
find "$BACKUP_DIR" -name 'advault-*.dump*' -type f -mtime +"$RETENTION_DAYS" -print -delete || true

echo "==> backup complete"
