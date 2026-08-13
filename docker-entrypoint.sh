#!/bin/sh
set -e

# `prisma migrate deploy` (not `migrate dev`) — the non-interactive command
# that only applies existing migrations, never generates new ones; the
# right one for any environment that isn't a developer's own machine.
# Safe to run from both the `app` and `worker` entrypoints in
# docker-compose.yml: Prisma's migration table itself acts as a lock, so a
# second concurrent "deploy" finds nothing pending and exits immediately
# rather than racing the first. For a real multi-replica deployment behind
# a load balancer, the better-practiced version of this is a distinct
# release-command/pre-deploy step (Railway and Render both support one)
# so migrations run exactly once per deploy, not once per replica on
# every restart — noted here rather than built, since this project's
# docker-compose topology is single-replica.
echo "Running database migrations..."
npx prisma migrate deploy

exec "$@"
