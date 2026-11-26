export const PIPELINE = [
  { key: "upload", label: "PDF uploaded", detail: "multipart upload" },
  { key: "extract", label: "Text extracted", detail: "pdf-parse" },
  { key: "chunk", label: "Chunked", detail: "500 tokens · 50 overlap" },
  { key: "embed", label: "Embedded", detail: "1536-dim vectors" },
  { key: "store", label: "Stored", detail: "pgvector" },
  { key: "search", label: "Searched", detail: "cosine · top 5" },
  { key: "answer", label: "Answered", detail: "LLM + context" },
];

/**
 * Seven-step pipeline tracker.
 * Steps before `active` are done; steps `active`..`activeTo` are running (several
 * at once when one request covers them); `failedAt` marks a step that errored.
 */
export default function PipelineSteps({ active = -1, activeTo, failedAt = -1, compact = false }) {
  const last = activeTo ?? active;
  return (
    <ol className={`pipeline ${compact ? "pipeline-compact" : ""}`}>
      {PIPELINE.map((step, i) => {
        const state =
          i === failedAt ? "failed" : i < active ? "done" : i <= last && i >= active ? "active" : "pending";
        return (
          <li key={step.key} className={`pipe-step ${state}`}>
            <span className="pipe-dot">
              {state === "done" ? (
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : state === "failed" ? (
                "!"
              ) : (
                i + 1
              )}
            </span>
            <span className="pipe-label">{step.label}</span>
            {!compact && <span className="pipe-detail">{step.detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}
