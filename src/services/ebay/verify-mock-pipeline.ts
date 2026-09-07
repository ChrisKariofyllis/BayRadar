import "dotenv/config";
import { createServer, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";

import type { Monitor } from "@prisma/client";

import { evaluateListing } from "@/services/filter";

import { buildMockCatalog, MOCK_TITLE_PREFIX, searchMockItems } from "./mock";
import type { EbayItemSummary } from "./types";

process.env.EBAY_MOCK_MODE = "true";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./data/bayradar.db";
}

interface CapturedAlert {
  title?: string;
  body: string;
}

function filterMonitor(partial: Pick<Monitor, "maxPrice" | "buyingType" | "maxRemainingHours" | "negativeKeywords">): Monitor {
  return {
    id: "verify",
    name: "verify",
    query: "verify",
    categoryId: null,
    cronSchedule: "*/15 * * * *",
    isActive: true,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const catalog = buildMockCatalog();

  assert(catalog.every((item) => item.title.startsWith(MOCK_TITLE_PREFIX)), "every mock title is tagged [MOCK]", failures);
  assertFilterMatrix(catalog, failures);
  assertSearchQueryIsolation(failures);

  const { prisma } = await import("@/db/prisma");
  const { executePollCycle } = await import("@/services/engine/poller");

  const alerts: CapturedAlert[] = [];
  const server = await listenForNtfy(alerts);

  const createdIds: string[] = [];
  let notificationId: string | undefined;

  try {
    const ps5 = await prisma.monitor.create({
      data: {
        name: "[VERIFY] PlayStation 5 deals",
        query: "PlayStation 5",
        maxPrice: 350,
        buyingType: "ALL",
        maxRemainingHours: 6,
        cronSchedule: "*/15 * * * *",
        isActive: true,
      },
    });
    const gbc = await prisma.monitor.create({
      data: {
        name: "[VERIFY] Game Boy Color under 50",
        query: "Game Boy Color",
        maxPrice: 50,
        buyingType: "ALL",
        cronSchedule: "*/15 * * * *",
        isActive: true,
      },
    });
    createdIds.push(ps5.id, gbc.id);

    const notification = await prisma.notificationSetting.create({
      data: {
        provider: "NTFY",
        name: "[VERIFY] local ntfy",
        endpointUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/bayradar-verify`,
        isEnabled: true,
        priority: 4,
      },
    });
    notificationId = notification.id;

    await prisma.seenListing.deleteMany({ where: { monitorId: { in: createdIds } } });

    const summary = await executePollCycle();
    if (summary.errors.length > 0) {
      failures.push(`poll cycle reported errors: ${summary.errors.map((error) => error.message).join("; ")}`);
    }

    const saved = await prisma.seenListing.findMany({
      where: { monitorId: { in: createdIds } },
      orderBy: { createdAt: "asc" },
    });

    const genuine = saved.filter((row) => row.title.includes("PlayStation 5 Digital Edition"));
    const junk = saved.filter(
      (row) =>
        /box only|nur karton|defekt|parts only|game boy color/i.test(row.title) &&
        !row.title.includes("PlayStation 5 Digital Edition"),
    );

    assert(summary.totalMonitors >= 2, `poller ran at least the two verify monitors (got ${summary.totalMonitors})`, failures);
    assert(genuine.length === 1, `exactly one genuine PS5 deal persisted (got ${genuine.length})`, failures);
    assert(junk.length === 0, `blacklisted/overpriced listings were not persisted (got ${junk.length})`, failures);
    assert(saved.length === 1, `only the genuine deal landed in seen_listings (got ${saved.length})`, failures);
    assert(summary.newDealsFound >= 1, `poller reported at least one new deal (got ${summary.newDealsFound})`, failures);

    const deadline = Date.now() + 3_000;
    while (alerts.length === 0 && Date.now() < deadline) {
      await sleep(50);
    }

    assert(alerts.length >= 1, `ntfy adapter dispatched at least one alert (got ${alerts.length})`, failures);
    assert(
      alerts.some((alert) => alert.body.includes("PlayStation 5 Digital Edition") || alert.title?.includes("PlayStation 5")),
      "ntfy payload mentions the genuine PS5 deal",
      failures,
    );
    assert(
      alerts.every((alert) => !/box only|nur karton|defekt|parts only/i.test(`${alert.title ?? ""} ${alert.body}`)),
      "ntfy did not fire for filtered scam listings",
      failures,
    );
  } finally {
    if (notificationId) {
      await prisma.notificationSetting.delete({ where: { id: notificationId } }).catch(() => undefined);
    }
    if (createdIds.length) {
      await prisma.seenListing.deleteMany({ where: { monitorId: { in: createdIds } } }).catch(() => undefined);
      await prisma.monitor.deleteMany({ where: { id: { in: createdIds } } }).catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
    await closeServer(server);
  }

  if (failures.length > 0) {
    console.error("\nMock pipeline verification FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("Mock pipeline verification passed.");
  console.log("  • Filter engine rejected BOX ONLY / Defekt / overpriced Game Boy Color");
  console.log("  • Genuine [MOCK] PlayStation 5 Digital Edition @ €290 persisted");
  console.log("  • Ntfy adapter dispatched an alert for the genuine deal");
}

function assertFilterMatrix(catalog: EbayItemSummary[], failures: string[]): void {
  const ps5Monitor = filterMonitor({
    maxPrice: 350,
    buyingType: "ALL",
    maxRemainingHours: 6,
    negativeKeywords: null,
  });
  const gbcMonitor = filterMonitor({
    maxPrice: 50,
    buyingType: "ALL",
    maxRemainingHours: null,
    negativeKeywords: null,
  });

  const byTitle = (needle: string) => catalog.find((item) => item.title.toLowerCase().includes(needle));
  const genuine = byTitle("playstation 5 digital");
  const boxOnly = byTitle("box only");
  const defekt = byTitle("defekt");
  const gbc = byTitle("game boy color");

  assert(Boolean(genuine), "catalog includes the genuine PS5 deal", failures);
  assert(Boolean(boxOnly), "catalog includes the BOX ONLY listing", failures);
  assert(Boolean(defekt), "catalog includes the Defekt listing", failures);
  assert(Boolean(gbc), "catalog includes the overpriced Game Boy Color", failures);
  if (!genuine || !boxOnly || !defekt || !gbc) return;

  assert(evaluateListing(genuine, ps5Monitor).passed, "genuine PS5 @ €290 / 3h passes the PS5 monitor", failures);
  assert(!evaluateListing(boxOnly, ps5Monitor).passed, "BOX ONLY is rejected by anti-scam keywords", failures);
  assert(!evaluateListing(defekt, ps5Monitor).passed, "Defekt / parts only is rejected", failures);
  assert(!evaluateListing(gbc, gbcMonitor).passed, "Game Boy Color @ €150 fails a €50 maxPrice", failures);
}

function assertSearchQueryIsolation(failures: string[]): void {
  const ps5 = searchMockItems({ query: "PlayStation 5", buyingType: "ALL" });
  const gbc = searchMockItems({ query: "Game Boy Color", buyingType: "ALL" });
  const titles = (response: ReturnType<typeof searchMockItems>) =>
    (response.itemSummaries ?? []).map((item) => item.title.toLowerCase());

  assert(
    titles(ps5).some((title) => title.includes("playstation 5 digital")),
    "PS5 search returns the genuine deal",
    failures,
  );
  assert(
    titles(ps5).every((title) => !title.includes("game boy color")),
    "PS5 search does not leak the Game Boy Color listing",
    failures,
  );
  assert(
    titles(gbc).length === 1 && titles(gbc)[0].includes("game boy color"),
    "Game Boy Color search returns only that listing (so the price filter can reject it)",
    failures,
  );
}

function listenForNtfy(alerts: CapturedAlert[]): Promise<import("node:http").Server> {
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    alerts.push({
      title: header(request, "title"),
      body,
    });
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

function closeServer(server: import("node:http").Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function assert(condition: boolean, message: string, failures: string[]): void {
  if (!condition) failures.push(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Mock pipeline verification crashed: ${message}`);
  process.exitCode = 1;
});

