import { PDFParse } from "pdf-parse";
import { getData } from "pdf-parse/worker";

// pdf-parse v2 runs on a current pdf.js. Point it at the worker bundled as a
// data URL, so it works in serverless functions (Vercel) without needing the
// worker file on disk.
PDFParse.setWorker(getData());

/** Remove characters Postgres text columns reject and tidy whitespace. */
export function cleanText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract text from a PDF buffer, one string per page, so chunks can be cited
 * by page number.
 */
export async function extractPdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const pageCount = result.total || result.pages.length;
    const pages = Array.from({ length: pageCount }, () => "");
    for (const page of result.pages) {
      if (page.num >= 1 && page.num <= pageCount) pages[page.num - 1] = cleanText(page.text || "");
    }

    let title = "";
    try {
      const info = await parser.getInfo();
      if (typeof info.info?.Title === "string") title = cleanText(info.info.Title);
    } catch {
      // Metadata is optional; fall back to the file name.
    }

    return { pages, pageCount, title };
  } finally {
    await parser.destroy();
  }
}
