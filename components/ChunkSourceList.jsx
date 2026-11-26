import { useEffect, useRef } from "react";
import { pageLabel } from "../lib/client";

/** The top-k retrieved chunks for an answer, with page range and cosine score. */
export default function ChunkSourceList({ sources = [], active, onSelect }) {
  const refs = useRef({});

  useEffect(() => {
    if (active && refs.current[active]) {
      refs.current[active].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [active]);

  if (!sources.length) {
    return (
      <p className="empty-note">
        Ask a question. The five passages most similar to it will show up here, with their page numbers and similarity scores.
      </p>
    );
  }

  return (
    <ol className="sources">
      {sources.map((s) => (
        <li
          key={s.n}
          ref={(el) => (refs.current[s.n] = el)}
          className={`source ${active === s.n ? "active" : ""}`}
        >
          <button type="button" className="source-head" onClick={() => onSelect?.(active === s.n ? null : s.n)}>
            <span className="source-n">{s.n}</span>
            <span className="source-page">{pageLabel(s.pageStart, s.pageEnd)}</span>
            <span className="source-score" title="Cosine similarity">
              <span className="score-bar"><span style={{ width: `${Math.max(0, Math.min(1, s.similarity)) * 100}%` }} /></span>
              {s.similarity.toFixed(3)}
            </span>
          </button>
          <p className={`source-text ${active === s.n ? "expanded" : ""}`}>{s.content}</p>
        </li>
      ))}
    </ol>
  );
}
