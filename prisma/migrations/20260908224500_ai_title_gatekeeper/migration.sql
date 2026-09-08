-- AlterTable
ALTER TABLE "monitors" ADD COLUMN "aiVerify" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "seen_listings" ADD COLUMN "aiVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "seen_listings" ADD COLUMN "aiVerificationReason" TEXT;
