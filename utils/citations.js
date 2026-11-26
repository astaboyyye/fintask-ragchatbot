// Helpers for showing model answers. Kept free of React so they can be unit-tested.

/**
 * Turn "[2]" citations into Markdown links ("[2](#cite-2)") that the chat UI
 * renders as clickable badges. Only ids of retrieved sources are linked, and
 * existing Markdown links ("[text](url)") are left alone.
 */
export function linkCitations(text, sourceCount) {
  return text.replace(/\[(\d{1,2})\](?!\()/g, (match, n) =>
    Number(n) >= 1 && Number(n) <= sourceCount ? `[${n}](#cite-${n})` : match
  );
}

/** "nvidia/nemotron-3-ultra-550b-a55b:free" -> "nemotron-3-ultra-550b-a55b" */
export function shortModel(model) {
  return String(model).split("/").pop().replace(/:free$/, "");
}
