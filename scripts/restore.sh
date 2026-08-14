#!/bin/sh
# Restores a backup produced by backup.sh into DATABASE_URL. Requires
# explicit confirmation because this overwrites whatever is currently in
# the target database — there is no undo once it runs.
#
# Usage: DATABASE_URL=postgresql://... ./scripts/restore.sh backups/ride-sharing-20260101T000000Z.sql.gz
set -eu

FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz>" >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

# See the matching comment in backup.sh — libpq rejects Prisma's ?schema=
# query param outright, and this project only ever uses `public` anyway.
PG_URL="${DATABASE_URL%%\?*}"

echo "This will DROP and recreate every object in the target database, then"
echo "restore from: $FILE"
echo "Target: $DATABASE_URL"
printf "Type 'yes' to continue: "
read -r confirmation
if [ "$confirmation" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Restoring ..."
gunzip -c "$FILE" | psql "$PG_URL" --set ON_ERROR_STOP=on

echo "Restore complete. Run 'npx prisma migrate deploy' next if this backup"
echo "predates migrations that have since been applied elsewhere."
