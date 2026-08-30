-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "categoryId" TEXT,
    "maxPrice" REAL NOT NULL,
    "buyingType" TEXT NOT NULL DEFAULT 'ALL',
    "maxRemainingHours" INTEGER,
    "negativeKeywords" TEXT,
    "cronSchedule" TEXT NOT NULL DEFAULT '*/15 * * * *',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "seen_listings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "buyingFormat" TEXT NOT NULL,
    "bidCount" INTEGER DEFAULT 0,
    "itemUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sellerFeedback" REAL,
    "endsAt" DATETIME,
    "notifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seen_listings_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snipe_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "seenListingId" TEXT,
    "monitorId" TEXT,
    "maxBid" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "leadTimeSec" INTEGER NOT NULL DEFAULT 6,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "executionLog" TEXT,
    "executeAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "snipe_tasks_seenListingId_fkey" FOREIGN KEY ("seenListingId") REFERENCES "seen_listings" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "snipe_tasks_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "name" TEXT,
    "endpointUrl" TEXT,
    "authToken" TEXT,
    "channel" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "seen_listings_itemId_idx" ON "seen_listings"("itemId");

-- CreateIndex
CREATE INDEX "seen_listings_monitorId_idx" ON "seen_listings"("monitorId");

-- CreateIndex
CREATE UNIQUE INDEX "seen_listings_itemId_monitorId_key" ON "seen_listings"("itemId", "monitorId");

-- CreateIndex
CREATE UNIQUE INDEX "snipe_tasks_seenListingId_key" ON "snipe_tasks"("seenListingId");

-- CreateIndex
CREATE INDEX "snipe_tasks_status_executeAt_idx" ON "snipe_tasks"("status", "executeAt");
