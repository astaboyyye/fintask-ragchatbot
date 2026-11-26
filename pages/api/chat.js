import { prisma } from "../../lib/db";
import { searchChunks, retrievalQuery, TOP_K, MIN_SIMILARITY } from "../../lib/vectorSearch";
import {
  streamAnswer,
  selectContext,
  describeClaudeError,
  isRetryableModelError,
  ANSWER_MODELS,
} from "../../lib/claudeRAG";
import { openEventStream } from "../../lib/sse";
import { EMBEDDING_MODEL } from "../../lib/embedder";
import { getOwner } from "../../utils/owner";
import { allowMethods, sendError } from "../../utils/api";

export const config = { maxDuration: 120 };

const MAX_QUESTION_CHARS = 2000;

/**
 * Steps 6-7 of the pipeline: embed the question, find the top-5 chunks by cosine
 * similarity, and stream the model's answer back as Server-Sent Events.
 * If a model is rate-limited or unavailable before it has written anything, the
 * next model in ANSWER_MODELS is tried.
 *
 * POST { documentId, question }
 * Events:  sources -> [{ n, id, index, pageStart, pageEnd, similarity, content }]
 *          delta   -> { text }          (answer text, streamed)
 *          reset   -> {}                (discard partial text: another model took over)
 *          done    -> { messageId, model, stopReason }
 *          error   -> { message }
 */
export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const owner = await getOwner(req, res);

  const { documentId } = req.body || {};
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (typeof documentId !== "string") return sendError(res, 400, "documentId is required.");
  if (!question) return sendError(res, 400, "Ask a question.");
  if (question.length > MAX_QUESTION_CHARS) {
    return sendError(res, 400, `Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, ownerId: owner.id },
    select: { id: true, title: true, status: true, embeddingModel: true },
  });
  if (!doc) return sendError(res, 404, "Document not found.");
  if (doc.status !== "READY") return sendError(res, 409, "This document hasn't finished processing yet.");
  // Vectors from different embedding models aren't comparable.
  if (doc.embeddingModel !== EMBEDDING_MODEL) {
    return sendError(res, 409, "This document was indexed with a different embedding model. Re-index it from the Documents page.");
  }

  const send = openEventStream(res);

  let stream;
  let clientGone = false;
  res.on("close", () => {
    clientGone = true;
    stream?.abort();
  });

  try {
    const history = await prisma.chatMessage.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });
    history.reverse();

    // Retrieve: top 5 by cosine similarity, then drop weak matches and cap the
    // total context size.
    const previousQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
    const ranked = await searchChunks(doc.id, retrievalQuery(question, previousQuestion), TOP_K);
    const chunks = selectContext(ranked, { minSimilarity: MIN_SIMILARITY });
    const sources = chunks.map((c, i) => ({
      n: i + 1,
      id: c.id,
      index: c.index,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      similarity: Math.round(c.similarity * 1000) / 1000,
      content: c.content,
    }));
    send("sources", sources);

    if (!chunks.length) {
      // Nothing relevant enough: say so rather than let the model improvise.
      const best = ranked[0]?.similarity ?? 0;
      const answer =
        "I couldn't find passages in this document that are relevant to that question " +
        `(best match: ${best.toFixed(2)} cosine similarity, below the ${MIN_SIMILARITY} threshold), ` +
        "so I won't guess. Try rephrasing, or ask about something the document covers.";
      send("delta", { text: answer });
      const [, saved] = await prisma.$transaction([
        prisma.chatMessage.create({ data: { documentId: doc.id, role: "user", content: question } }),
        prisma.chatMessage.create({ data: { documentId: doc.id, role: "assistant", content: answer, sources: [] } }),
      ]);
      send("done", { messageId: saved.id, model: null, stopReason: "no_relevant_context" });
      return;
    }

    // Generate, moving to the next model if one is rate-limited or down.
    let answer = "";
    let final;
    let usedModel;
    for (let attempt = 0; attempt < ANSWER_MODELS.length; attempt++) {
      usedModel = ANSWER_MODELS[attempt];
      stream = streamAnswer({ question, chunks, history, documentTitle: doc.title, model: usedModel });
      try {
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block?.type === "fallback") {
            // The primary model declined mid-answer and a fallback model restarts the reply.
            answer = "";
            send("reset", {});
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            answer += event.delta.text;
            send("delta", { text: event.delta.text });
          }
        }
        final = await stream.finalMessage();
        break;
      } catch (err) {
        const canFailOver = !answer && !clientGone && attempt < ANSWER_MODELS.length - 1;
        if (!canFailOver || !isRetryableModelError(err)) throw err;
        console.warn(`Model ${usedModel} unavailable (${err.status ?? err.name}); trying the next one.`);
      }
    }
    if (!answer.trim() && final.stop_reason !== "refusal") {
      throw new Error("The model returned an empty answer. Try asking again.");
    }

    if (final.stop_reason === "refusal") {
      answer = "I can't help with that request.";
      send("reset", {});
      send("delta", { text: answer });
    } else if (final.stop_reason === "max_tokens") {
      const note = "\n\n_(Answer truncated: it reached the length limit.)_";
      answer += note;
      send("delta", { text: note });
    }

    const [, saved] = await prisma.$transaction([
      prisma.chatMessage.create({ data: { documentId: doc.id, role: "user", content: question } }),
      prisma.chatMessage.create({
        data: { documentId: doc.id, role: "assistant", content: answer, sources, model: final.model || usedModel },
      }),
    ]);

    send("done", { messageId: saved.id, model: final.model || usedModel, stopReason: final.stop_reason });
  } catch (err) {
    if (!clientGone) {
      console.error("Chat failed", err);
      const message = err?.message?.startsWith("No embeddings API key")
        ? err.message
        : describeClaudeError(err);
      send("error", { message });
    }
  } finally {
    res.end();
  }
}
