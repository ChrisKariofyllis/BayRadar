-- CreateTable
CREATE TABLE "gixen_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "snipe_tasks" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'GIXEN';
ALTER TABLE "snipe_tasks" ADD COLUMN "providerSnipeId" TEXT;
