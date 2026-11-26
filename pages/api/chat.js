import { prisma } from "../../lib/db";
import { searchChunks, TOP_K } from "../../lib/vectorSearch";
import { streamAnswer, describeClaudeError, CLAUDE_MODEL } from "../../lib/claudeRAG";
import { getOwner } from "../../lib/owner";
import { allowMethods, sendError } from "../../lib/api";

export const config = { maxDuration: 120 };

const MAX_QUESTION_CHARS = 2000;

/**
 * Steps 6-7 of the pipeline: embed the question, find the top-5 chunks by cosine
 * similarity, and stream Claude's answer back as Server-Sent Events.
 *
 * POST { documentId, question }
 * Events:  sources -> [{ n, id, index, pageStart, pageEnd, similarity, content }]
 *          delta   -> { text }          (answer text, streamed)
 *          reset   -> {}                (discard partial text: a fallback model took over)
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
    select: { id: true, title: true, status: true },
  });
  if (!doc) return sendError(res, 404, "Document not found.");
  if (doc.status !== "READY") return sendError(res, 409, "This document hasn't finished processing yet.");

  // Open the SSE stream.
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

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

    // Retrieve
    const chunks = await searchChunks(doc.id, question, TOP_K);
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

    // Generate
    stream = streamAnswer({ question, chunks, history, documentTitle: doc.title });
    let answer = "";
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
    const final = await stream.finalMessage();

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
        data: { documentId: doc.id, role: "assistant", content: answer, sources },
      }),
    ]);

    send("done", { messageId: saved.id, model: final.model || CLAUDE_MODEL, stopReason: final.stop_reason });
  } catch (err) {
    if (!clientGone) {
      console.error("Chat failed", err);
      const message = err?.message?.includes("OPENAI_API_KEY")
        ? err.message
        : describeClaudeError(err);
      send("error", { message });
    }
  } finally {
    res.end();
  }
}
