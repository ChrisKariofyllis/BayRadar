# BayRadar

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED)](./Dockerfile)
[![Version](https://img.shields.io/badge/version-v0.1.0--alpha-orange)](./package.json)

Self-hosted eBay deal radar for Germany and other marketplaces. Watch searches, filter junk listings, and get alerts — from a home server or Vercel.

## Features

- **Deal monitoring** — keyword + category + max price, auctions and Buy It Now
- **Anti-scam filters** — negative keywords (`ovp`, `defekt`, `box only`, …) and auction time windows
- **Multi-channel alerts** — Ntfy, Telegram, Discord, Gotify
- **Web UI credentials manager** — paste eBay App ID / Cert ID in Settings (SQLite first, `.env` fallback)
- **Hybrid deploy** — Docker worker + dashboard, or Vercel cron + Turso

## Quickstart (self-hosted / Docker)

### One-line install

```bash
curl -sSL https://raw.githubusercontent.com/ChrisKariofyllis/BayRadar/main/install.sh | bash
```

The installer checks Docker, clones into `~/bayradar`, generates `APP_SECRET`, and starts the stack.

### Manual Docker Compose

```bash
git clone https://github.com/ChrisKariofyllis/BayRadar.git
cd BayRadar
cp .env.example .env   # set APP_SECRET
docker compose up -d --build
```

Open **http://localhost:3000** → **Settings** → enter your eBay keys → create a monitor → **Trigger Scan Now**.

Data lives in the `bayradar_data` volume (`/app/prisma/data`).

## Quickstart (Vercel serverless)

1. Create a [Turso](https://turso.tech) (libSQL) database and copy the URL + auth token.
2. Import the GitHub repo into [Vercel](https://vercel.com).
3. Set environment variables:
   - `DATABASE_URL` — Turso URL (Prisma + libSQL adapter, or Turso HTTP URL if you switch providers)
   - `CRON_SECRET` — random string (Vercel Cron sends it as `Authorization: Bearer …`)
   - Optional fallbacks: `EBAY_APP_ID`, `EBAY_CERT_ID` (or configure them in the dashboard after deploy)
4. Add a Vercel Cron job for `GET /api/cron/poll` every 5 minutes (`vercel.json` already includes this).
5. Deploy. Open `/settings`, save eBay credentials, and create monitors.

Serverless mode is **deal-finding only**. The sub-second auto-sniper runs on the self-hosted worker, not on Vercel.

> Prisma in this repo ships with SQLite. For Turso, add a libSQL driver adapter and point `DATABASE_URL` at your Turso database before going to production.

## eBay API setup in 2 minutes

1. Go to [developer.ebay.com](https://developer.ebay.com) and create a free developer account.
2. Open **Application Keys** (Keyset) for **Production** (or Sandbox for tests).
3. Copy **App ID (Client ID)** and **Cert ID (Client Secret)**.
4. In BayRadar, open **Settings → eBay Account & API Configuration**.
5. Paste the keys, pick **PRODUCTION** or **SANDBOX**, choose a marketplace (default `EBAY_DE`), then **Save Configuration**.
6. Click **Test eBay Connection**. You should see a success badge.

No RuName is required for Browse search (client-credentials grant).

## Local development

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev          # dashboard
npm run worker       # optional poller daemon
```

## Roadmap

- High-precision sub-second **Auto-Sniper** (fire bid at T-6s)
- Telegram interactive inline bidding
- Machine-learning valuation / “is this actually cheap?”

## License

MIT — see [LICENSE](./LICENSE).
