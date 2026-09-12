-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN "priceEstimatorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_settings" ADD COLUMN "minArbitrageDiscount" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "seen_listings" ADD COLUMN "estimatedFmv" REAL;
ALTER TABLE "seen_listings" ADD COLUMN "discountPercent" REAL;
