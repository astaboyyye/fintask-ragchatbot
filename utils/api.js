/** Small helpers shared by the API routes. */

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: `Method ${req.method} not allowed` });
  return false;
}

/** Fields of a Document that are safe to send to the browser. */
export const publicDocumentSelect = {
  id: true,
  title: true,
  fileName: true,
  fileSize: true,
  pageCount: true,
  charCount: true,
  status: true,
  error: true,
  chunkCount: true,
  tokenCount: true,
  embeddingModel: true,
  createdAt: true,
  updatedAt: true,
};

/** A READY document whose vectors came from a different embedding model. */
export function withIndexState(doc, embeddingModel) {
  return { ...doc, needsReindex: doc.status === "READY" && doc.embeddingModel !== embeddingModel };
}

export function sendError(res, status, message, err) {
  if (err) console.error(message, err);
  res.status(status).json({ error: message });
}
