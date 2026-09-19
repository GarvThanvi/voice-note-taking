-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasSeenGuide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showGuideOnLogin" BOOLEAN NOT NULL DEFAULT false;
