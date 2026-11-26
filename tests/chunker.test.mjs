import test from "node:test";
import assert from "node:assert/strict";
import { getEncoding } from "js-tiktoken";
import { chunkPages, CHUNK_SIZE, CHUNK_OVERLAP } from "../lib/chunker.js";

const enc = getEncoding("cl100k_base");
const words = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

test("short text becomes a single chunk", () => {
  const chunks = chunkPages(["Hello world. This is a tiny document."]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].pageStart, 1);
  assert.equal(chunks[0].pageEnd, 1);
});

test("chunks are at most 500 tokens and consecutive chunks overlap by 50", () => {
  const pages = [words(400, "alpha"), words(400, "beta"), words(400, "gamma")];
  const chunks = chunkPages(pages);
  assert.ok(chunks.length > 2);
  for (const c of chunks) assert.ok(c.tokenCount <= CHUNK_SIZE);
  for (let i = 0; i < chunks.length - 1; i++) assert.equal(chunks[i].tokenCount, CHUNK_SIZE);

  // The last 50 tokens of chunk i are the first 50 tokens of chunk i+1.
  const all = enc.encode(pages.join("\n\n"));
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  const a = all.slice(0, CHUNK_SIZE).slice(-CHUNK_OVERLAP);
  const b = all.slice(step, step + CHUNK_OVERLAP);
  assert.deepEqual(a, b);
});

test("page ranges are tracked across page boundaries", () => {
  const chunks = chunkPages([words(300, "p1w"), "", words(300, "p3w")]);
  assert.equal(chunks[0].pageStart, 1);
  assert.ok(chunks.some((c) => c.pageStart === 1 && c.pageEnd === 3), "a chunk spans pages 1-3");
  assert.equal(chunks.at(-1).pageEnd, 3);
  assert.ok(!chunks.some((c) => c.pageStart === 2), "empty page 2 contributes no tokens");
});

test("empty input yields no chunks and bad options throw", () => {
  assert.deepEqual(chunkPages(["", "   "]), []);
  assert.throws(() => chunkPages(["x"], { chunkSize: 50, overlap: 50 }));
});
