import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractPdf, isPdf, contentHash, UploadError } from "../lib/pdf.js";

const sample = fs.readFileSync(new URL("../public/sample/northwind-annual-report-2025.pdf", import.meta.url));

test("extracts text per page and the title from a real PDF", async () => {
  const r = await extractPdf(sample);
  assert.equal(r.pageCount, 4);
  assert.equal(r.title, "Northwind Capital Annual Report 2025");
  assert.match(r.pages[2], /capital adequacy ratio of 21\.4 percent/);
});

test("rejects files that are not PDFs", async () => {
  assert.equal(isPdf(Buffer.from("hello")), false);
  await assert.rejects(extractPdf(Buffer.from("hello world")), (e) => e instanceof UploadError && e.status === 415);
});

test("rejects damaged PDFs with a clear error", async () => {
  await assert.rejects(extractPdf(Buffer.from("%PDF-1.7\nnot really a pdf")), (e) => e instanceof UploadError && e.status === 422);
});

test("identical files get identical content hashes", () => {
  assert.equal(contentHash(sample), contentHash(Buffer.from(sample)));
  assert.notEqual(contentHash(sample), contentHash(Buffer.from("other")));
});
