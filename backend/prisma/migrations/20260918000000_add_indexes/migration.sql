-- CreateIndex
CREATE INDEX "Note_userId_deletedAt_archived_updatedAt_idx" ON "Note"("userId", "deletedAt", "archived", "updatedAt");

-- CreateIndex
CREATE INDEX "Todo_noteId_order_idx" ON "Todo"("noteId", "order");

-- Trigram indexes for fuzzy voice search (resolveTarget similarity queries)
CREATE INDEX "Note_title_trgm_idx" ON "Note" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Todo_text_trgm_idx" ON "Todo" USING gin ("text" gin_trgm_ops);
