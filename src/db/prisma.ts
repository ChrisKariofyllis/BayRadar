import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaLog = process.env.NODE_ENV === "development" ? (["warn", "error"] as const) : (["error"] as const);

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL?.trim();

  if (isRemoteLibsqlUrl(url)) {
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
    if (!authToken) {
      throw new Error(
        "TURSO_AUTH_TOKEN is required when DATABASE_URL is a remote Turso/libSQL URL (libsql:// or https://).",
      );
    }

    const config = { url, authToken };
    createClient(config);
    const adapter = new PrismaLibSQL(config);
    return new PrismaClient({ adapter, log: prismaLog });
  }

  return new PrismaClient({ log: prismaLog });
}

function isRemoteLibsqlUrl(url: string | undefined): url is string {
  return Boolean(url && (url.startsWith("libsql://") || url.startsWith("https://")));
}
