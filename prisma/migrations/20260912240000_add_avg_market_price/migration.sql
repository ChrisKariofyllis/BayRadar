-- AlterTable
ALTER TABLE "seen_listings" ADD COLUMN "avgMarketPrice" REAL;
UPDATE "seen_listings" SET "avgMarketPrice" = "avgSoldPrice" WHERE "avgSoldPrice" IS NOT NULL;
ALTER TABLE "seen_listings" DROP COLUMN "avgSoldPrice";
