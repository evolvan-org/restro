#!/bin/sh
# Applies any pending Prisma migrations to the Postgres container, then starts
# the API. `migrate deploy` is idempotent and safe to run on every boot — it
# only applies committed migrations and is a no-op when none are pending.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma

echo "[entrypoint] Starting API..."
exec "$@"
