import fs from "fs/promises";
import formidable from "formidable";
import { prisma } from "../../lib/db";
import { extractPdf } from "../../lib/pdf";
import { getOwner } from "../../lib/owner";
import { allowMethods, publicDocumentSelect, sendError } from "../../lib/api";

// Vercel caps serverless request bodies at 4.5 MB.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

/**
 * Steps 1-2 of the pipeline: receive the PDF and extract its text.
 * POST multipart/form-data with a `file` field.
 */
export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const owner = await getOwner(req, res);

  const form = formidable({ maxFiles: 1, maxFileSize: MAX_UPLOAD_BYTES, allowEmptyFiles: false });
  let file;
  try {
    const [, files] = await form.parse(req);
    file = Array.isArray(files.file) ? files.file[0] : files.file;
  } catch (err) {
    const tooBig = err?.httpCode === 413 || /maxFileSize/i.test(err?.message || "");
    return sendError(res, tooBig ? 413 : 400, tooBig ? "PDF is larger than 4 MB." : "Could not read the upload.");
  }
  if (!file) return sendError(res, 400, "No file uploaded. Send the PDF in a `file` field.");

  try {
    const buffer = await fs.readFile(file.filepath);
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return sendError(res, 415, "That file is not a PDF.");
    }

    const started = Date.now();
    let extracted;
    try {
      extracted = await extractPdf(buffer);
    } catch (err) {
      return sendError(res, 422, "Could not parse this PDF. It may be encrypted or damaged.", err);
    }
    const charCount = extracted.pages.reduce((n, p) => n + p.length, 0);
    if (charCount < 20) {
      return sendError(res, 422, "No selectable text found. Scanned PDFs need OCR before they can be used.");
    }

    const fileName = (file.originalFilename || "document.pdf").slice(0, 200);
    const title = (extracted.title || fileName.replace(/\.pdf$/i, "")).slice(0, 200);

    const document = await prisma.document.create({
      data: {
        ownerId: owner.id,
        title,
        fileName,
        fileSize: buffer.length,
        pageCount: extracted.pageCount,
        charCount,
        pages: extracted.pages,
      },
      select: publicDocumentSelect,
    });

    res.status(201).json({ document, timings: { extractMs: Date.now() - started } });
  } catch (err) {
    sendError(res, 500, "Upload failed.", err);
  } finally {
    fs.unlink(file.filepath).catch(() => {});
  }
}
