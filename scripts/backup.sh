#!/bin/sh
# Dumps the Postgres database to a timestamped, gzip-compressed file and
# prunes anything older than the retention window. This is the piece that
# was entirely missing before: the Postgres data directory only ever lived
# in a single Docker volume (or a single managed-DB instance) with zero
# export path — a lost/corrupted volume was unrecoverable data loss with
# no mitigation at all.
#
# Deliberately a plain script, not a scheduled job inside the app: backups
# have to survive the app being down or broken, so they can't depend on
# app code running successfully. Wire this into cron / a platform's
# scheduled-task feature (Railway/Render cron, a Kubernetes CronJob, etc.)
# pointed at wherever this runs with DATABASE_URL and BACKUP_DIR in its
# environment — see the Backup & Disaster Recovery section in README.md.
#
# Usage: BACKUP_DIR=/var/backups/ride-sharing ./scripts/backup.sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

# Prisma appends ?schema=public to DATABASE_URL (its own convention for
# picking a Postgres schema) — libpq's connection-string parser doesn't
# recognize that query param and rejects the whole URL with "invalid URI
# query parameter: schema". Stripping it is safe here: this project only
# ever uses the default `public` schema, so an unqualified pg_dump already
# dumps exactly what's needed.
PG_URL="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
outfile="$BACKUP_DIR/ride-sharing-$timestamp.sql.gz"

echo "Dumping database to $outfile ..."
pg_dump "$PG_URL" --format=plain --no-owner --no-privileges | gzip > "$outfile"
echo "Backup written: $(du -h "$outfile" | cut -f1)"

echo "Pruning backups older than $RETENTION_DAYS days ..."
find "$BACKUP_DIR" -name 'ride-sharing-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

echo "Done."
