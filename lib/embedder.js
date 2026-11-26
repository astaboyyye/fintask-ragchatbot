import OpenAI from "openai";
import { embeddingProvider } from "./providers";

// text-embedding-3-small returns 1536-dimensional vectors, the same size as
// ada-002, which matches the vector(1536) column in prisma/schema.prisma.
// Called directly with OPENAI_API_KEY, or through OpenRouter (lib/providers.js).
const provider = embeddingProvider();
export const EMBEDDING_MODEL = provider?.model || "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 96;

let client;
function getClient() {
  if (!provider) {
    throw new Error("No embeddings API key: set OPENAI_API_KEY or OPENROUTER_API_KEY.");
  }
  if (!client) client = new OpenAI(provider.clientOptions);
  return client;
}

async function embedBatch(inputs) {
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  if (!Array.isArray(res?.data) || res.data.length !== inputs.length) {
    throw new Error("The embeddings API returned an unexpected response.");
  }
  // The API returns items with an `index`; sort to be safe about ordering.
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embed many texts, in batches, preserving input order. */
export async function embedTexts(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const vectors = await embedBatch(texts.slice(i, i + BATCH_SIZE));
    out.push(...vectors);
  }
  return out;
}

/** Embed a single query string. */
export async function embed(text) {
  const [vector] = await embedBatch([text]);
  return vector;
}

/** Serialize a vector to pgvector's text format: "[0.1,0.2,...]". */
export function toPgVector(vector) {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimensional embedding`);
  }
  return `[${vector.join(",")}]`;
}
