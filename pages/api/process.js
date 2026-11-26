import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db";
import { chunkPages, CHUNK_OVERLAP, CHUNK_SIZE } from "../../lib/chunker";
import { embedTexts, toPgVector, EMBEDDING_MODEL } from "../../lib/embedder";
import { getOwner } from "../../lib/owner";
import { allowMethods, publicDocumentSelect, sendError } from "../../lib/api";

export const config = { maxDuration: 300 };

const INSERT_BATCH = 100;

/**
 * Steps 3-5 of the pipeline: chunk the extracted text, embed every chunk, and
 * store chunks + vectors in pgvector. Safe to call again to re-process.
 * POST { documentId }
 */
export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const owner = await getOwner(req, res);
  const { documentId } = req.body || {};
  if (typeof documentId !== "string") return sendError(res, 400, "documentId is required.");

  const doc = await prisma.document.findFirst({
    where: { id: documentId, ownerId: owner.id },
    select: { id: true, pages: true, status: true, updatedAt: true },
  });
  if (!doc) return sendError(res, 404, "Document not found.");
  // A run that died mid-way (e.g. a function timeout) leaves PROCESSING behind;
  // after 5 minutes treat it as stale and allow a retry.
  const stale = Date.now() - new Date(doc.updatedAt).getTime() > 5 * 60_000;
  if (doc.status === "PROCESSING" && !stale) {
    return sendError(res, 409, "This document is already being processed.");
  }

  await prisma.document.update({ where: { id: doc.id }, data: { status: "PROCESSING", error: null } });

  try {
    const t0 = Date.now();
    const chunks = chunkPages(doc.pages, { chunkSize: CHUNK_SIZE, overlap: CHUNK_OVERLAP });
    if (!chunks.length) throw new Error("No text to chunk.");
    const t1 = Date.now();

    const vectors = await embedTexts(chunks.map((c) => c.content));
    const t2 = Date.now();

    await prisma.$transaction(async (tx) => {
      await tx.chunk.deleteMany({ where: { documentId: doc.id } });
      for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
        const rows = chunks.slice(i, i + INSERT_BATCH).map(
          (c, j) => Prisma.sql`(${randomUUID()}, ${doc.id}, ${c.index}, ${c.content}, ${c.tokenCount},
            ${c.pageStart}, ${c.pageEnd}, ${toPgVector(vectors[i + j])}::vector)`
        );
        await tx.$executeRaw`
          INSERT INTO "Chunk" ("id", "documentId", "index", "content", "tokenCount", "pageStart", "pageEnd", "embedding")
          VALUES ${Prisma.join(rows)}`;
      }
    }, { timeout: 120_000 });
    const t3 = Date.now();

    const document = await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: "READY",
        chunkCount: chunks.length,
        tokenCount: chunks.reduce((n, c) => n + c.tokenCount, 0),
      },
      select: publicDocumentSelect,
    });

    res.status(200).json({
      document,
      stats: {
        chunks: chunks.length,
        chunkSize: CHUNK_SIZE,
        overlap: CHUNK_OVERLAP,
        embeddingModel: EMBEDDING_MODEL,
        dimensions: vectors[0]?.length,
      },
      timings: { chunkMs: t1 - t0, embedMs: t2 - t1, storeMs: t3 - t2 },
    });
  } catch (err) {
    console.error("Processing failed", err);
    const message = err?.message?.startsWith("No embeddings API key")
      ? err.message
      : err?.status === 401
        ? "The embeddings API key is invalid."
        : err?.status === 402
          ? "The AI provider account is out of credits. Add credits and try again."
          : "Processing failed while creating embeddings. Try again.";
    await prisma.document
      .update({ where: { id: doc.id }, data: { status: "FAILED", error: message } })
      .catch(() => {});
    res.status(500).json({ error: message });
  }
}
