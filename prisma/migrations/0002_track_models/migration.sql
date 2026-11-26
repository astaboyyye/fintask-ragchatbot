-- Record which embedding model indexed each document, and which model wrote each answer.
ALTER TABLE "Document" ADD COLUMN "embeddingModel" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "model" TEXT;
