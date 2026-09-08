-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "aiApiKey" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "updatedAt" DATETIME NOT NULL
);
