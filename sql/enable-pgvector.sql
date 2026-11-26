-- pgvector setup.
-- `prisma migrate deploy` runs this automatically (prisma/migrations/0001_init),
-- so you only need this file if you are preparing the database by hand.
CREATE EXTENSION IF NOT EXISTS vector;

-- Sanity check: cosine distance between two vectors (0 = identical direction).
SELECT '[1,0,0]'::vector <=> '[1,0,0]'::vector AS same_direction,   -- 0
       '[1,0,0]'::vector <=> '[0,1,0]'::vector AS orthogonal;       -- 1

-- Example retrieval query the app runs (lib/vectorSearch.js):
--   SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
--   FROM "Chunk"
--   WHERE "documentId" = $2 AND embedding IS NOT NULL
--   ORDER BY embedding <=> $1::vector
--   LIMIT 5;
--
-- Search is scoped to one document, so the planner filters by documentId first
-- and runs an exact (brute-force) cosine ranking over that document's chunks.
-- That is exact and fast for documents of a few thousand chunks. An approximate
-- HNSW index only pays off for search across many documents:
--   CREATE INDEX ON "Chunk" USING hnsw (embedding vector_cosine_ops);
