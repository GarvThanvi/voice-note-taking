-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "order" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: preserve the current updatedAt-desc visual order (newest first => smallest order)
UPDATE "Note" AS n
SET "order" = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "updatedAt" DESC) AS rn
  FROM "Note"
) AS ranked
WHERE n.id = ranked.id;

-- CreateIndex
CREATE INDEX "Note_userId_deletedAt_archived_order_idx" ON "Note"("userId", "deletedAt", "archived", "order");
