-- AlterTable
ALTER TABLE "gixen_settings" ADD COLUMN "handshakeOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gixen_settings" ADD COLUMN "handshakeAt" DATETIME;
ALTER TABLE "gixen_settings" ADD COLUMN "mirrorActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gixen_settings" ADD COLUMN "sessionCookie" TEXT;
ALTER TABLE "gixen_settings" ADD COLUMN "sessionId" TEXT;
