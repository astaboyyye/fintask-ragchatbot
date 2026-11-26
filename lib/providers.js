// Which APIs and models the app uses, chosen from the keys that are set.
//
// Answers:    ANTHROPIC_API_KEY  -> Claude, direct.
//             OpenRouter key     -> OpenRouter's Anthropic-compatible endpoint.
//                                   Defaults to free models (no credits needed);
//                                   set LLM_MODELS to use others, e.g.
//                                   "anthropic/claude-opus-5.5".
// Embeddings: OPENAI_API_KEY     -> text-embedding-3-small, direct.
//             OpenRouter key     -> a free NVIDIA Nemotron embedding model,
//                                   asked for 1536-dimension vectors.
//
// An OpenRouter key can be given as OPENROUTER_API_KEY, or placed in
// ANTHROPIC_API_KEY: OpenRouter keys start with "sk-or-" and are detected.

const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
const openRouterKey =
  process.env.OPENROUTER_API_KEY || (anthropicKey.startsWith("sk-or-") ? anthropicKey : "");

export const OPENROUTER_BASE = "https://openrouter.ai/api";

// Free OpenRouter models, tried in order: free models are sometimes rate-limited
// upstream, so the chat route moves on to the next one when that happens.
const FREE_ANSWER_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
];
const FREE_EMBEDDING_MODEL = "nvidia/nemotron-3.5-embed-8b:free";

function modelList(value) {
  return (value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function answerProvider() {
  if (anthropicKey && !anthropicKey.startsWith("sk-or-")) {
    return {
      name: "anthropic",
      clientOptions: { apiKey: anthropicKey },
      models: [modelList(process.env.LLM_MODELS || process.env.CLAUDE_MODEL)[0] || "claude-opus-5-5"],
      supportsFallbacks: true,
      supportsEffort: true,
    };
  }
  if (openRouterKey) {
    const configured = modelList(process.env.LLM_MODELS || process.env.CLAUDE_MODEL);
    return {
      name: "openrouter",
      // OpenRouter expects the key as a Bearer token. One SDK retry, then the
      // chat route falls through to the next model instead of waiting.
      clientOptions: { baseURL: OPENROUTER_BASE, apiKey: null, authToken: openRouterKey, maxRetries: 1 },
      models: configured.length ? configured : FREE_ANSWER_MODELS,
      supportsFallbacks: false,
      supportsEffort: configured.some((m) => m.startsWith("anthropic/")),
    };
  }
  return null;
}

export function embeddingProvider() {
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      clientOptions: { apiKey: process.env.OPENAI_API_KEY },
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    };
  }
  if (openRouterKey) {
    return {
      name: "openrouter",
      clientOptions: { apiKey: openRouterKey, baseURL: `${OPENROUTER_BASE}/v1` },
      model: process.env.EMBEDDING_MODEL || FREE_EMBEDDING_MODEL,
    };
  }
  return null;
}
