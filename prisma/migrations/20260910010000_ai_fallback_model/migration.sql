-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN "aiFallbackModel" TEXT DEFAULT 'gemini-3.1-flash-lite';
ALTER TABLE "ai_settings" ADD COLUMN "enableFallback" BOOLEAN NOT NULL DEFAULT true;
