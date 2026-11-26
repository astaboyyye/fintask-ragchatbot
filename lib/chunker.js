import { getEncoding } from "js-tiktoken";

// cl100k_base is the tokenizer used by OpenAI's text-embedding-3 / ada-002
// models, so "500 tokens" here means 500 tokens as the embedding model sees them.
let encoder;
function getEncoder() {
  if (!encoder) encoder = getEncoding("cl100k_base");
  return encoder;
}

// The assignment specifies 500-token chunks with a 50-token (10%) overlap.
// Both can be tuned per deployment, e.g. CHUNK_OVERLAP=100 for dense documents
// whose sentences often run past 50 tokens.
export const CHUNK_SIZE = Number(process.env.CHUNK_SIZE) || 500;
export const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP ?? 50);

export function countTokens(text) {
  return getEncoder().encode(text).length;
}

/**
 * Split a document into overlapping token windows.
 *
 * Pages are tokenized in order and every token remembers which page it came
 * from, so each chunk knows the page range it covers. That range is what the
 * chat UI shows as the source citation ("p. 4–5").
 *
 * @param {string[]} pages   extracted text, one entry per PDF page
 * @param {{chunkSize?: number, overlap?: number}} [opts]
 * @returns {{index:number, content:string, tokenCount:number, pageStart:number, pageEnd:number}[]}
 */
export function chunkPages(pages, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error("chunkSize must be a positive integer");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be an integer in [0, chunkSize)");
  }

  const enc = getEncoder();
  const tokens = [];
  const tokenPage = [];
  const separator = enc.encode("\n\n");
  let prevPage = 0;

  pages.forEach((pageText, i) => {
    const text = (pageText || "").trim();
    if (!text) return;
    // The blank line between pages counts toward the earlier page, so a chunk
    // that ends on it isn't credited to a page it has no text from.
    if (prevPage) {
      for (const t of separator) {
        tokens.push(t);
        tokenPage.push(prevPage);
      }
    }
    // Plain loop: spreading a large array into push() can overflow the stack.
    for (const t of enc.encode(text)) {
      tokens.push(t);
      tokenPage.push(i + 1);
    }
    prevPage = i + 1;
  });

  const chunks = [];
  const step = chunkSize - overlap;
  for (let start = 0; start < tokens.length; start += step) {
    const end = Math.min(start + chunkSize, tokens.length);
    const content = enc.decode(tokens.slice(start, end)).trim();
    if (content) {
      chunks.push({
        index: chunks.length,
        content,
        tokenCount: end - start,
        pageStart: tokenPage[start],
        pageEnd: tokenPage[end - 1],
      });
    }
    if (end === tokens.length) break;
  }
  return chunks;
}

/** Backwards-compatible helper for plain text (single "page"). */
export function chunkText(text, opts) {
  return chunkPages([text], opts);
}
