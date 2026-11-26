// Which API keys the app talks to.
//
// Claude:     ANTHROPIC_API_KEY (direct), or an OpenRouter key, via OpenRouter's
//             Anthropic-compatible Messages endpoint.
// Embeddings: OPENAI_API_KEY (direct), or an OpenRouter key, via OpenRouter's
//             embeddings endpoint (same text-embedding-3-small model).
//
// An OpenRouter key can be given as OPENROUTER_API_KEY, or placed in
// ANTHROPIC_API_KEY: OpenRouter keys start with "sk-or-" and are detected.

const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
const openRouterKey =
  process.env.OPENROUTER_API_KEY || (anthropicKey.startsWith("sk-or-") ? anthropicKey : "");

export const OPENROUTER_BASE = "https://openrouter.ai/api";

export function claudeProvider() {
  if (anthropicKey && !anthropicKey.startsWith("sk-or-")) {
    return {
      name: "anthropic",
      clientOptions: { apiKey: anthropicKey },
      model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
      supportsFallbacks: true,
    };
  }
  if (openRouterKey) {
    return {
      name: "openrouter",
      // OpenRouter expects the key as a Bearer token.
      clientOptions: { baseURL: OPENROUTER_BASE, apiKey: null, authToken: openRouterKey },
      model: process.env.CLAUDE_MODEL || "anthropic/claude-opus-5.5",
      supportsFallbacks: false,
    };
  }
  return null;
}

export function embeddingProvider() {
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  if (process.env.OPENAI_API_KEY) {
    return { name: "openai", clientOptions: { apiKey: process.env.OPENAI_API_KEY }, model };
  }
  if (openRouterKey) {
    return {
      name: "openrouter",
      clientOptions: { apiKey: openRouterKey, baseURL: `${OPENROUTER_BASE}/v1` },
      model: model.includes("/") ? model : `openai/${model}`,
    };
  }
  return null;
}
