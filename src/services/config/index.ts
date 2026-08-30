import { prisma } from "@/db/prisma";

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
