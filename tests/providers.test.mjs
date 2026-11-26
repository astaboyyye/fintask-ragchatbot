import test from "node:test";
import assert from "node:assert/strict";
import { answerProvider, embeddingProvider } from "../lib/providers.js";

test("an OpenRouter key alone selects free models for answers and embeddings", () => {
  const env = { OPENROUTER_API_KEY: "sk-or-v1-test" };
  assert.equal(answerProvider(env).name, "openrouter");
  assert.ok(answerProvider(env).models.every((m) => m.endsWith(":free")));
  assert.equal(embeddingProvider(env).model, "nvidia/nemotron-3.5-embed-8b:free");
});

test("an sk-or- key in ANTHROPIC_API_KEY is treated as an OpenRouter key", () => {
  const p = answerProvider({ ANTHROPIC_API_KEY: "sk-or-v1-test" });
  assert.equal(p.name, "openrouter");
  assert.equal(p.clientOptions.baseURL, "https://openrouter.ai/api");
  assert.equal(p.supportsFallbacks, false);
});

test("direct Anthropic and OpenAI keys use Claude and text-embedding-3-small", () => {
  const env = { ANTHROPIC_API_KEY: "sk-ant-test", OPENAI_API_KEY: "sk-test" };
  assert.deepEqual(answerProvider(env).models, ["claude-opus-5-5"]);
  assert.equal(answerProvider(env).supportsFallbacks, true);
  assert.equal(embeddingProvider(env).model, "text-embedding-3-small");
});

test("LLM_MODELS overrides the answer models, in order", () => {
  const p = answerProvider({ OPENROUTER_API_KEY: "sk-or-v1-test", LLM_MODELS: "anthropic/claude-opus-5.5, x/y:free" });
  assert.deepEqual(p.models, ["anthropic/claude-opus-5.5", "x/y:free"]);
  assert.equal(p.supportsEffort, true);
});

test("no keys means no providers", () => {
  assert.equal(answerProvider({}), null);
  assert.equal(embeddingProvider({}), null);
});
