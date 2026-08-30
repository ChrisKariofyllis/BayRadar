#!/bin/sh
set -eu

mkdir -p /app/prisma/data
chown -R nextjs:nodejs /app/prisma/data 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
  exec su-exec nextjs:nodejs /app/docker-start.sh
fi

exec /app/docker-start.sh
