import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { embed, toPgVector } from "./embedder";

export const TOP_K = 5;

// Chunks less similar than this are not relevant enough to answer from. If no
// chunk clears it, the chat route says the document doesn't cover the question
// instead of letting the model improvise from unrelated text.
// 0.2 was measured on this app's embedding models: passages that answer a
// question score about 0.3-0.6, unrelated ones about 0.05-0.15. (Absolute
// cosine values depend on the model, so a fixed 0.7 would reject nearly
// everything.) Override with MIN_SIMILARITY.
export const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.2);

/**
 * Cosine-similarity search over one document's chunks.
 *
 * pgvector's `<=>` operator is cosine *distance* (1 - cosine similarity), so we
 * order by it ascending and report `1 - distance` as the similarity score.
 */
export async function searchChunks(documentId, query, k = TOP_K) {
  const vector = toPgVector(await embed(query));
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT "id", "index", "content", "tokenCount", "pageStart", "pageEnd",
           1 - ("embedding" <=> ${vector}::vector) AS "similarity"
    FROM "Chunk"
    WHERE "documentId" = ${documentId} AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vector}::vector
    LIMIT ${k}
  `);
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}

/**
 * The text to embed for retrieval. A follow-up like "and next year?" carries
 * little meaning alone, so short questions are combined with the previous one.
 */
export function retrievalQuery(question, previousQuestion) {
  const short = question.split(/\s+/).filter(Boolean).length < 8;
  return short && previousQuestion ? `${previousQuestion}
${question}` : question;
}

// Name kept from the starter kit.
export const search = searchChunks;
