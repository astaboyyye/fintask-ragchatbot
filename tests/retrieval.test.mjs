import test from "node:test";
import assert from "node:assert/strict";
import { selectContext } from "../lib/claudeRAG.js";

const chunk = (id, similarity, tokenCount = 500) => ({ id, similarity, tokenCount, content: "x" });

test("chunks below the similarity threshold are dropped", () => {
  const ranked = [chunk("a", 0.52), chunk("b", 0.31), chunk("c", 0.12), chunk("d", 0.08)];
  assert.deepEqual(selectContext(ranked, { minSimilarity: 0.2 }).map((c) => c.id), ["a", "b"]);
});

test("nothing relevant yields an empty context", () => {
  assert.deepEqual(selectContext([chunk("a", 0.1), chunk("b", 0.05)], { minSimilarity: 0.2 }), []);
});

test("total context is capped at maxTokens, keeping the best-ranked chunks", () => {
  const ranked = [chunk("a", 0.6, 1200), chunk("b", 0.5, 1200), chunk("c", 0.4, 1200)];
  assert.deepEqual(selectContext(ranked, { maxTokens: 3000 }).map((c) => c.id), ["a", "b"]);
});

test("five normal 500-token chunks fit the default budget", () => {
  const ranked = [0.6, 0.5, 0.4, 0.35, 0.3].map((s, i) => chunk(String(i), s));
  assert.equal(selectContext(ranked).length, 5);
});
