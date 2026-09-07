# 📡 BayRadar

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED)](./Dockerfile)
[![Version](https://img.shields.io/badge/version-v0.1.0--alpha-orange)](./package.json)

> **Self-hosted, automated eBay deal radar & auction monitor.**  
> Monitor targeted searches, filter out scams and junk listings, and get real-time instant alerts on your phone via Tailscale or your home server.

Created with ⚡ by **[Chris Kariofyllis](https://github.com/ChrisKariofyllis)**.

---

## ✨ Features

- 🎯 **Targeted Monitoring** — Search queries, category constraints, max target price, and buying formats (Auction vs. Buy It Now).
- 🛡️ **Anti-Scam & Box Exclusion** — Automatic regex filters exclude empty boxes, defects, and scam patterns (`ovp`, `nur karton`, `box only`, `defekt`, `parts only`).
- ⏱️ **Auction Time Windows** — Alert only on auctions entering their final hours (e.g. `<= 24h` remaining) to avoid bid inflation noise.
- 📱 **Multi-Channel Push Alerts** — Native dispatchers for **Ntfy**, **Telegram**, **Discord**, and **Gotify** with direct eBay links and image previews.
- 🧪 **Built-in Mock / Demo Engine** — Test the entire pipeline, filtering, and notifications immediately without waiting for eBay Developer key approval.
- ⚙️ **In-App Credentials Manager** — Configure eBay App ID, Cert ID, and marketplace targets directly from the Web UI.
- 🐳 **Self-Hosted & Docker Native** — Single container packaging Next.js Dashboard + Background Poller Daemon with persistent SQLite storage.

---

## 🚀 Quickstart (Self-Hosted / Home Server)

### Option A: The 1-Line Installer (Recommended)

Run this on your server:

```bash
curl -sSL https://raw.githubusercontent.com/ChrisKariofyllis/BayRadar/main/install.sh | bash
```

The installer verifies Docker dependencies, clones the repository into `~/bayradar`, configures credentials, and boots the container stack.

### Option B: Manual Docker Compose

```bash
git clone https://github.com/ChrisKariofyllis/BayRadar.git
cd BayRadar
cp .env.example .env

# Start the stack (Dashboard on port 3050)
docker compose up -d --build
```

Open [http://localhost:3050](http://localhost:3050) (or your server's local LAN/Tailscale IP) in your browser.

---

## 🧪 Testing Immediately (Mock Engine)

You don't need active eBay API keys to start testing!

1. Open **Settings** in the dashboard.
2. Ensure **Demo / Mock Engine** is enabled.
3. Click **Test eBay Connection** to verify the local mock engine.
4. Add a Ntfy channel or Discord Webhook in Settings and send a test notification.
5. Create a Monitor (e.g., PlayStation 5 @ €350) and click **Trigger Scan Now**. The mock engine will simulate deals and filter out scam boxes automatically.

---

## 🔑 eBay API Setup (When Ready)

Once you want live marketplace data:

1. Sign up for a free developer account at [developer.ebay.com](https://developer.ebay.com).
2. Generate an Application Keyset (App ID and Cert ID) for Production.
3. Open BayRadar **Settings → eBay Account & API Configuration**.
4. Paste your App ID and Cert ID, choose your marketplace (`EBAY_DE`, `EBAY_US`, etc.), and disable Mock Mode.
5. Click **Save Configuration** and run your first live scan.

---

## ☁️ Cloud Deployment (Vercel Serverless)

**Status: Experimental**

BayRadar ships with native SQLite. To run serverless on Vercel:

1. Provision a serverless SQLite database on [Turso](https://turso.tech).
2. Point `DATABASE_URL` to your Turso database and configure the libSQL Prisma driver adapter.
3. Trigger scans via external cron or Vercel Cron targeting `GET /api/cron/poll`.

> **Note:** High-precision sub-second sniping requires the self-hosted Docker daemon.

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Run SQLite migrations
npx prisma migrate dev

# Run Next.js dashboard
npm run dev

# Run worker daemon in separate terminal
npm run worker
```

---

## 🗺️ Roadmap

- [ ] **Phase 7: Precision Auto-Sniper** (sub-second bids fired at T-6s before auction close).
- [ ] **Telegram Interactive Bot:** 1-Click bidding via Telegram inline buttons when a deal is reported.
- [ ] **Marketplace Arbitrage & Price Estimator:** Machine-learning valuation to estimate genuine discount percentages.

---

## 📄 License

Distributed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html) (GPL-3.0). See [LICENSE](./LICENSE) for more details.
