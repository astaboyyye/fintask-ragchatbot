import { prisma } from "../../lib/db";
import { readPdfUpload, extractPdf, contentHash, UploadError } from "../../lib/pdf";
import { EMBEDDING_MODEL } from "../../lib/embedder";
import { getOwner } from "../../utils/owner";
import { allowMethods, publicDocumentSelect, sendError, withIndexState } from "../../utils/api";

export const config = {
  api: { bodyParser: false }, // formidable reads the multipart body itself
  maxDuration: 60,
};

/**
 * Steps 1-2 of the pipeline: receive the PDF, validate it, extract its text.
 * POST multipart/form-data with a `file` field.
 *
 * Re-uploading a PDF this visitor already has returns the existing document
 * (`duplicate: true`), so its stored embeddings are reused instead of paying
 * for them again.
 */
export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const owner = await getOwner(req, res);

  try {
    const { buffer, fileName } = await readPdfUpload(req);
    const hash = contentHash(buffer);

    const existing = await prisma.document.findFirst({
      where: { ownerId: owner.id, contentHash: hash },
      orderBy: { createdAt: "desc" },
      select: publicDocumentSelect,
    });
    if (existing) {
      return res.status(200).json({ document: withIndexState(existing, EMBEDDING_MODEL), duplicate: true, timings: { extractMs: 0 } });
    }

    const started = Date.now();
    const extracted = await extractPdf(buffer);
    const title = (extracted.title || fileName.replace(/\.pdf$/i, "")).slice(0, 200);

    const document = await prisma.document.create({
      data: {
        ownerId: owner.id,
        title,
        fileName,
        fileSize: buffer.length,
        contentHash: hash,
        pageCount: extracted.pageCount,
        charCount: extracted.charCount,
        pages: extracted.pages,
      },
      select: publicDocumentSelect,
    });

    res.status(201).json({ document, duplicate: false, timings: { extractMs: Date.now() - started } });
  } catch (err) {
    if (err instanceof UploadError) return sendError(res, err.status, err.message);
    sendError(res, 500, "Upload failed.", err);
  }
}
