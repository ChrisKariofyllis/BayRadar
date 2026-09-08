import { prisma } from "@/db/prisma";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "@/lib/ai-defaults";

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

  return {
    aiBaseUrl,
    aiApiKey,
    aiModel,
    configured: Boolean(aiApiKey) || isLocalAiEndpoint(aiBaseUrl),
  };
}

export function isLocalAiEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "host.docker.internal";
  } catch {
    return false;
  }
}
