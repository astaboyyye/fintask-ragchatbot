import Anthropic from "@anthropic-ai/sdk";
import { answerProvider } from "./providers";

// Claude on the Anthropic API, or any model through OpenRouter's
// Anthropic-compatible endpoint (free models by default; see lib/providers.js).
// Either way the requests go through the Anthropic SDK.
const provider = answerProvider();
export const ANSWER_MODELS = provider?.models || ["claude-opus-5-5"];
// Document Q&A is chat-shaped: "low" keeps answers fast; raise it if you need
// more careful reasoning over long, dense documents.
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "low";
const MAX_HISTORY_MESSAGES = 8;

let client;
function getClient() {
  if (!provider) throw new Error("No answer-model API key: set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.");
  if (!client) client = new Anthropic(provider.clientOptions);
  return client;
}

const SYSTEM_PROMPT = `You answer questions about a document the user uploaded. Each turn you receive the passages from that document that are most relevant to the question, retrieved by vector search, inside <sources>. Each passage has a numeric id and the page range it came from.

Base your answer on those passages. Cite the passage that supports each claim with its id in square brackets, like [1] or [2][4], placed right after the claim. Only cite ids that appear in <sources>.

If the passages do not contain the answer, say that the document doesn't appear to cover it, and mention what the passages do cover if that helps. Do not fill gaps with outside knowledge presented as if it came from the document; if general knowledge is useful, label it clearly as not from the document.

Write in Markdown. Be direct and match the length to the question: a sentence or two for simple lookups, short paragraphs or a list for explanations.`;

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Format retrieved chunks as numbered sources for the prompt. */
export function buildContext(chunks) {
  return chunks
    .map((c, i) => {
      const pages = c.pageStart === c.pageEnd ? `${c.pageStart}` : `${c.pageStart}-${c.pageEnd}`;
      return `<source id="${i + 1}" pages="${pages}">\n${escapeXml(c.content)}\n</source>`;
    })
    .join("\n");
}

/**
 * Start a streaming answer grounded in the retrieved chunks, using `model`
 * (one of ANSWER_MODELS).
 * Returns the SDK MessageStream; the caller iterates events and forwards text.
 *
 * On the direct Anthropic API, `fallbacks: "default"` lets the API re-run the
 * request on a fallback model if the primary model declines it, inside the same
 * call. OpenRouter doesn't accept that parameter, so it is only sent direct.
 */
export function streamAnswer({ question, chunks, history = [], documentTitle, model = ANSWER_MODELS[0] }) {
  const priorTurns = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
  // The API requires the conversation to start with a user turn.
  while (priorTurns.length && priorTurns[0].role !== "user") priorTurns.shift();

  const userContent = `<document title="${escapeXml(documentTitle || "Untitled")}">
<sources>
${buildContext(chunks)}
</sources>
</document>

Question: ${question}`;

  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [...priorTurns, { role: "user", content: userContent }],
  };
  if (provider?.supportsEffort) params.output_config = { effort: CLAUDE_EFFORT };
  const anthropic = getClient();
  if (provider.supportsFallbacks) {
    return anthropic.beta.messages.stream({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  }
  return anthropic.messages.stream(params);
}

/** Errors worth retrying on the next model: rate limits, overload, outages. */
export function isRetryableModelError(err) {
  if (err instanceof Anthropic.APIConnectionError) return true;
  return [408, 429, 500, 502, 503, 504, 529].includes(err?.status);
}

/** Map SDK errors to a message that is safe and useful to show in the UI. */
export function describeClaudeError(err) {
  if (err?.status === 402) return "The AI provider account is out of credits. Add credits and try again.";
  if (err instanceof Anthropic.AuthenticationError) return "The API key for the answer model is missing or invalid.";
  if (err instanceof Anthropic.RateLimitError) {
    return "The answer model is rate-limited right now (free models have daily limits). Try again in a moment.";
  }
  if (err instanceof Anthropic.BadRequestError) return `The model rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the model API.";
  if (err instanceof Anthropic.APIError) return `Model API error (${err.status ?? "unknown"}). Try again.`;
  return err?.message || "Unexpected error while generating the answer.";
}
