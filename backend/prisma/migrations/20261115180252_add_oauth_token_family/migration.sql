-- AlterTable
ALTER TABLE "OauthToken" ADD COLUMN     "familyId" TEXT;

-- CreateIndex
CREATE INDEX "OauthToken_familyId_idx" ON "OauthToken"("familyId");

-- Backfill existing rows so every row belongs to a family. Each pre-existing row
-- becomes its own family; production has no OAuth tokens before this task.
UPDATE "OauthToken" SET "familyId" = "id"::text WHERE "familyId" IS NULL;
