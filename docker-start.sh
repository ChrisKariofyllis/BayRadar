#!/bin/sh
set -eu

export NODE_ENV="${NODE_ENV:-production}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export DATABASE_URL="${DATABASE_URL:-file:/app/prisma/data/bayradar.db}"

echo "[bayradar] Applying Prisma migrations…"
npx prisma migrate deploy

echo "[bayradar] Starting dashboard and worker…"
node server.js &
NEXT_PID=$!
npx tsx src/worker/daemon.ts &
WORKER_PID=$!

shutdown() {
  echo "[bayradar] Shutting down…"
  kill -TERM "$NEXT_PID" "$WORKER_PID" 2>/dev/null || true
  wait "$NEXT_PID" "$WORKER_PID" 2>/dev/null || true
}

trap shutdown INT TERM

wait "$NEXT_PID"
shutdown
