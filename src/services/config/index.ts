import { prisma } from "@/db/prisma";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_FALLBACK_MODEL, DEFAULT_AI_MODEL } from "@/lib/ai-defaults";
import { DEFAULT_MIN_ARBITRAGE_DISCOUNT, MIN_ARBITRAGE_DISCOUNT_RANGE } from "@/lib/valuation/defaults";

export async function getConfigValue(key: string): Promise<string | undefined> {
  const row = await prisma.systemConfig.findUnique({
    where: { key },
    select: { value: true },
  });

  const fromDb = row?.value?.trim();
  if (fromDb) return fromDb;

  const fromEnv = process.env[key]?.trim();
  return fromEnv || undefined;
}

export async function setConfigValues(entries: Record<string, string>): Promise<void> {
  const operations = Object.entries(entries)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        create: { key, value, description: `Managed via Settings UI` },
        update: { value },
      }),
    );

  if (operations.length === 0) return;
  await prisma.$transaction(operations);
}

export async function getEbayRuntimeConfig() {
  const [appId, certId, environment, marketplaceId] = await Promise.all([
    getConfigValue("EBAY_APP_ID"),
    getConfigValue("EBAY_CERT_ID"),
    getConfigValue("EBAY_ENVIRONMENT"),
    getConfigValue("EBAY_MARKETPLACE_ID"),
  ]);

  return {
    appId: appId ?? "",
    certId: certId ?? "",
    environment: environment === "SANDBOX" ? ("SANDBOX" as const) : ("PRODUCTION" as const),
    marketplaceId: marketplaceId || "EBAY_DE",
  };
}

export async function getAiRuntimeConfig() {
  const row = await prisma.aiSettings.findUnique({ where: { id: "default" } });
  const envBase = process.env.AI_BASE_URL?.trim();
  const envKey = process.env.AI_API_KEY?.trim();
  const envModel = process.env.AI_MODEL?.trim();

  const aiBaseUrl = row?.aiBaseUrl?.trim() || envBase || DEFAULT_AI_BASE_URL;
  const aiApiKey = row?.aiApiKey?.trim() || envKey || "";
  const aiModel = row?.aiModel?.trim() || envModel || DEFAULT_AI_MODEL;
  const aiFallbackModel = row?.aiFallbackModel?.trim() || DEFAULT_AI_FALLBACK_MODEL;
  const enableFallback = row?.enableFallback ?? true;

  return {
    aiBaseUrl,
    aiApiKey,
    aiModel,
    aiFallbackModel,
    enableFallback,
    configured: Boolean(aiApiKey) || isLocalAiEndpoint(aiBaseUrl),
  };
}

export async function getGixenRuntimeConfig() {
  const row = await prisma.gixenSettings.findUnique({ where: { id: "default" } });
  const username = row?.username?.trim() || process.env.GIXEN_USERNAME?.trim() || "";
  const password = row?.password?.trim() || process.env.GIXEN_PASSWORD?.trim() || "";
  const envEnabled = process.env.GIXEN_ENABLED?.trim().toLowerCase();
  const enabledFromEnv = envEnabled === "true" || envEnabled === "1";
  const enabled = row ? row.enabled : enabledFromEnv;

  return {
    username,
    password,
    enabled,
    configured: Boolean(username && password),
    handshakeOk: Boolean(row?.handshakeOk),
    handshakeAt: row?.handshakeAt ?? null,
    mirrorActive: Boolean(row?.mirrorActive),
    sessionCookie: row?.sessionCookie?.trim() || "",
    sessionId: row?.sessionId?.trim() || "",
  };
}

export async function getEstimatorRuntimeConfig() {
  const row = await prisma.aiSettings.findUnique({
    where: { id: "default" },
    select: { priceEstimatorEnabled: true, minArbitrageDiscount: true },
  });

  return {
    enabled: Boolean(row?.priceEstimatorEnabled),
    minDiscount: clampArbitrageDiscount(row?.minArbitrageDiscount),
  };
}

export function clampArbitrageDiscount(value: number | null | undefined): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_MIN_ARBITRAGE_DISCOUNT;
  return Math.min(
    MIN_ARBITRAGE_DISCOUNT_RANGE.max,
    Math.max(MIN_ARBITRAGE_DISCOUNT_RANGE.min, parsed),
  );
}

export function isLocalAiEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "host.docker.internal";
  } catch {
    return false;
  }
}
