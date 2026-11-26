import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// Document Q&A is chat-shaped: "low" keeps answers fast; raise it if you need
// more careful reasoning over long, dense documents.
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "low";
const MAX_HISTORY_MESSAGES = 8;

let client;
function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY
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
 * Start a streaming Claude answer grounded in the retrieved chunks.
 * Returns the SDK MessageStream; the caller iterates events and forwards text.
 *
 * `fallbacks: "default"` lets the API re-run the request on a fallback model if
 * the primary model declines it, inside the same call.
 */
export function streamAnswer({ question, chunks, history = [], documentTitle }) {
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

  return getClient().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: CLAUDE_EFFORT },
    system: SYSTEM_PROMPT,
    messages: [...priorTurns, { role: "user", content: userContent }],
  });
}

/** Map SDK errors to a message that is safe and useful to show in the UI. */
export function describeClaudeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key is missing or invalid.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limited right now. Try again in a moment.";
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Claude API.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "unknown"}). Try again.`;
  return err?.message || "Unexpected error while generating the answer.";
}
