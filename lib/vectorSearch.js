import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { embed, toPgVector } from "./embedder";

export const TOP_K = 5;

/**
 * Cosine-similarity search over one document's chunks.
 *
 * pgvector's `<=>` operator is cosine *distance* (1 - cosine similarity), so we
 * order by it ascending and report `1 - distance` as the similarity score.
 */
export async function searchChunks(documentId, query, k = TOP_K) {
  const vector = toPgVector(await embed(query));
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT "id", "index", "content", "pageStart", "pageEnd",
           1 - ("embedding" <=> ${vector}::vector) AS "similarity"
    FROM "Chunk"
    WHERE "documentId" = ${documentId} AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vector}::vector
    LIMIT ${k}
  `);
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}

// Name kept from the starter kit.
export const search = searchChunks;
