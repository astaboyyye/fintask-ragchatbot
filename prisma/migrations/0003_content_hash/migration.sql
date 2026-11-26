-- Hash of each uploaded PDF, so re-uploading the same file reuses its embeddings.
ALTER TABLE "Document" ADD COLUMN "contentHash" TEXT;
CREATE INDEX "Document_ownerId_contentHash_idx" ON "Document"("ownerId", "contentHash");
