# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tech-savvy bargain hunters, hardware enthusiasts, and homelab self-hosters tracking specific electronics, cameras, hardware, or collectibles for personal purchase.

## Product Purpose

BayRadar is a self-hosted, automated eBay deal radar and auction monitor. It continuously monitors user-defined search parameters, filters out scam and junk listings, scores real margins against market value baselines, and delivers instant actionable alerts and sniping controls to keep buyers ahead of competitive deals without manual refreshing. Success means catching undervalued listings safely and securing desired items at target prices.

## Positioning

Unlike generic eBay saved searches or noisy price alerts, BayRadar provides a dedicated homelab-native monitoring pipeline with scam/box regex filtering, an AI Title Gatekeeper that understands parts and foreign listing nuances (e.g., German `mit OVP` vs packaging-only), live Idealo refurb market baselines for true discount validation, and one-tap Gixen auction sniping directly from notifications or the feed.

## Operating Context

- **Environment**: Homelab servers, local NAS/minis, or private VPS run via single-container Docker or Vercel + Turso libSQL. Accessed on local networks or remote overlays (e.g. Tailscale).
- **Workflows**: Setting targeted monitors (keywords, price ceilings, categories, formats), automated background poller runs (every 30 seconds via worker daemon or scheduled cron), instant push notification delivery to personal channels (Ntfy, Telegram, Discord, Gotify), mobile quick-viewing of incoming deals, and executing last-second snipes via Gixen or Telegram inline buttons.
- **Tools & Ecosystem**: eBay Finding/Browse APIs, Idealo refurbished/B-Ware price reference scraper, Gixen sniping service, Telegram Bot API, OpenAI-compatible AI providers (Gemini, Groq, OpenAI, OpenRouter, Anthropic, Ollama).

## Capabilities and Constraints

- **Confirmed Capabilities**:
  - Continuous background search polling with multi-marketplace support (`EBAY_DE`, `EBAY_US`, etc.).
  - Hard regex negative filters against parts, defects, and empty boxes across languages.
  - Optional AI Smart Exclude negative keyword suggestion and AI Title Gatekeeper with automated model fallback on quota limits.
  - Fair market value comparisons against Idealo refurbished prices.
  - Direct integration with Gixen for automated last-second bidding.
  - Multi-channel notification dispatchers (Telegram interactive bot, Ntfy, Discord, Gotify).
  - Built-in zero-credential mock engine for complete local offline testing and onboarding.
  - Responsive web dashboard with live SSE scan streaming and mobile quick-view bottom sheets.
- **Constraints**:
  - Privacy-first self-hosted deployment: single container, local persistence (SQLite/Docker volume) or personal Turso instance; no telemetry or centralized user accounts.
  - Respects eBay API rate limits and AI quota restrictions through batching, caching, and fallback tiers.

## Brand Commitments

- **Name**: BayRadar
- **Identity & Ethos**: Precision radar / utility aesthetics; dark mode, focused, information-dense, no marketing fluff or corporate SaaS bloat.
- **License**: GPL-3.0-or-later.

## Evidence on Hand

- Fully functional codebase with Next.js 16 (App Router), React 19, Tailwind CSS v4, Prisma 6.
- In-tree mock test engine (`src/services/ebay/mock.ts`) and mock verification pipeline (`verify-mock-pipeline.ts`).
- Documentation and setup guide in [README.md](file:///home/chris/projects/BayRadar/README.md) with demo screenshot at `docs/bayradar.png`.

## Product Principles

1. **Signal Over Noise**: Filter out junk, accessories, empty boxes, and false discounts aggressively so every notification represents a genuine, actionable opportunity.
2. **Homelab & Privacy First**: Zero third-party telemetry, self-contained single-docker operation, and full ownership of credentials and data.
3. **Action-Oriented Utility**: Bridge discovery directly to execution—allow evaluating fair value, reviewing listing details, and arming snipes immediately from the dashboard or chat.
4. **Resilient & Graceful Degradation**: Continue operating smoothly through API quota hits, 429 rate limits, and network hiccups via mock engines, local filter fallbacks, and model retries.
