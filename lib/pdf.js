// Steps 1-2 of the pipeline: receive the uploaded PDF, validate it on the
// server, and extract its text page by page.
import { createHash } from "crypto";
import fs from "fs/promises";
import formidable from "formidable";
import { PDFParse, PasswordException, InvalidPDFException } from "pdf-parse";
import { getData } from "pdf-parse/worker";

// pdf-parse v2 runs on a current pdf.js. Point it at the worker bundled as a
// data URL, so it works in serverless functions (Vercel) without needing the
// worker file on disk.
PDFParse.setWorker(getData());

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const MAX_PAGES = 500;
const MIN_TEXT_CHARS = 20;

/** An upload problem with an HTTP status and a message that is safe to show. */
export class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Remove characters Postgres text columns reject and tidy whitespace. */
export function cleanText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the bytes start with the PDF file signature. */
export function isPdf(buffer) {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** SHA-256 of the file, used to spot re-uploads of the same PDF. */
export function contentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Read the `file` field of a multipart/form-data request (the API route must
 * disable Next's body parser). Returns the bytes and the original file name.
 */
export async function readPdfUpload(req) {
  const form = formidable({ maxFiles: 1, maxFileSize: MAX_UPLOAD_BYTES, allowEmptyFiles: false });
  let file;
  try {
    const [, files] = await form.parse(req);
    file = Array.isArray(files.file) ? files.file[0] : files.file;
  } catch (err) {
    const tooBig = err?.httpCode === 413 || /maxFileSize/i.test(err?.message || "");
    throw new UploadError(tooBig ? 413 : 400, tooBig ? "PDF is larger than 4 MB." : "Could not read the upload.");
  }
  if (!file) throw new UploadError(400, "No file uploaded. Send the PDF in a `file` field.");
  try {
    const buffer = await fs.readFile(file.filepath);
    return { buffer, fileName: (file.originalFilename || "document.pdf").slice(0, 200) };
  } finally {
    fs.unlink(file.filepath).catch(() => {});
  }
}

/**
 * Validate a PDF and extract its text, one string per page, so chunks can be
 * cited by page number. Throws UploadError for files the app can't use.
 */
export async function extractPdf(buffer) {
  if (!isPdf(buffer)) throw new UploadError(415, "That file is not a PDF.");

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    let result;
    try {
      result = await parser.getText();
    } catch (err) {
      if (err instanceof PasswordException || err?.name === "PasswordException") {
        throw new UploadError(422, "This PDF is password-protected. Remove the password and upload it again.");
      }
      if (err instanceof InvalidPDFException || err?.name === "InvalidPDFException") {
        throw new UploadError(422, "This PDF is damaged or not a valid PDF.");
      }
      throw new UploadError(422, "Could not read this PDF.");
    }

    const pageCount = result.total || result.pages.length;
    if (pageCount > MAX_PAGES) {
      throw new UploadError(422, `PDFs up to ${MAX_PAGES} pages are supported (this one has ${pageCount}).`);
    }
    const pages = Array.from({ length: pageCount }, () => "");
    for (const page of result.pages) {
      if (page.num >= 1 && page.num <= pageCount) pages[page.num - 1] = cleanText(page.text || "");
    }
    const charCount = pages.reduce((n, p) => n + p.length, 0);
    if (charCount < MIN_TEXT_CHARS) {
      throw new UploadError(422, "No selectable text found. Scanned or image-only PDFs need OCR before they can be used.");
    }

    let title = "";
    try {
      const info = await parser.getInfo();
      if (typeof info.info?.Title === "string") title = cleanText(info.info.Title);
    } catch {
      // Metadata is optional; the caller falls back to the file name.
    }

    return { pages, pageCount, charCount, title };
  } finally {
    await parser.destroy();
  }
}
