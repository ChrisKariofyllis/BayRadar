-- CreateEnum
-- SQLite stores enums as TEXT; Prisma maps SeenListingStatus in the client.

-- AlterTable
ALTER TABLE "seen_listings" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACCEPTED';
