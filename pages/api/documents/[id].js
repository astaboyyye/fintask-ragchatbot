import { prisma } from "../../../lib/db";
import { getOwner } from "../../../lib/owner";
import { allowMethods, publicDocumentSelect, sendError, withIndexState } from "../../../lib/api";
import { EMBEDDING_MODEL } from "../../../lib/embedder";

/**
 * GET:    one document plus its chat history.
 * DELETE: remove the document; its chunks and messages cascade.
 */
export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "DELETE"])) return;
  const owner = await getOwner(req, res);
  const id = String(req.query.id);

  const doc = await prisma.document.findFirst({
    where: { id, ownerId: owner.id },
    select: publicDocumentSelect,
  });
  if (!doc) return sendError(res, 404, "Document not found.");

  if (req.method === "DELETE") {
    await prisma.document.delete({ where: { id: doc.id } });
    return res.status(204).end();
  }

  const messages = await prisma.chatMessage.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, sources: true, model: true, createdAt: true },
  });
  res.status(200).json({ document: withIndexState(doc, EMBEDDING_MODEL), messages });
}
