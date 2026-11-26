import test from "node:test";
import assert from "node:assert/strict";
import { linkCitations, shortModel } from "../lib/citations.js";

test("citations for retrieved sources become badge links", () => {
  assert.equal(linkCitations("Ratio is 21.4% [1][3].", 5), "Ratio is 21.4% [1](#cite-1)[3](#cite-3).");
});

test("ids outside the retrieved range and real links are left alone", () => {
  assert.equal(linkCitations("See [7] and [0].", 5), "See [7] and [0].");
  assert.equal(linkCitations("[2](https://example.com)", 5), "[2](https://example.com)");
});

test("model ids are shortened for display", () => {
  assert.equal(shortModel("nvidia/nemotron-3-ultra-550b-a55b:free"), "nemotron-3-ultra-550b-a55b");
  assert.equal(shortModel("claude-opus-5-5"), "claude-opus-5-5");
});
