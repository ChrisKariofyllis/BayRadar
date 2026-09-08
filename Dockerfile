# syntax=docker/dockerfile:1

FROM node:20-slim AS deps
WORKDIR /app
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
# ignore-scripts avoids Prisma/libSQL postinstall binaries crashing npm on this host.
# Drop musl optional natives so Next.js cannot load them on glibc (ld.so SIGSEGV).
RUN for i in 1 2 3; do \
      npm ci --ignore-scripts --no-audit --no-fund --maxsockets=2 && break; \
      echo "npm ci failed (attempt ${i}), retrying…"; \
      rm -rf node_modules; \
      sleep 2; \
    done \
  && test -d node_modules/next \
  && rm -rf node_modules/@next/swc-linux-x64-musl node_modules/@img/sharp-linuxmusl-x64 \
  && npx prisma generate

FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/app/prisma/data/bayradar.db

RUN apt-get update && apt-get install -y openssl ca-certificates tini gosu && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home /nonexistent --shell /usr/sbin/nologin nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY docker-entrypoint.sh docker-start.sh ./
RUN chmod +x /app/docker-entrypoint.sh /app/docker-start.sh \
  && mkdir -p /app/prisma/data \
  && chown -R nextjs:nodejs /app/prisma/data

VOLUME ["/app/prisma/data"]
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
