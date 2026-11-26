import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pageLabel } from "../utils/client";
import { linkCitations, shortModel } from "../utils/citations";

export default function ChatMessage({ role, content, sources = [], streaming = false, model, onCite, activeCite }) {
  if (role === "user") {
    return (
      <div className="msg msg-user">
        <div className="bubble">{content}</div>
      </div>
    );
  }

  const components = {
    a({ href = "", children }) {
      const m = href.match(/^#cite-(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        const src = sources[n - 1];
        return (
          <button
            type="button"
            className={`cite ${activeCite === n ? "active" : ""}`}
            onClick={() => onCite?.(n)}
            title={src ? `Source ${n} · ${pageLabel(src.pageStart, src.pageEnd)}` : `Source ${n}`}
          >
            {n}
          </button>
        );
      }
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
    },
  };

  return (
    <div className="msg msg-assistant">
      <span className="msg-avatar" aria-hidden>AI</span>
      <div className="msg-body">
        {content ? (
          <div className="prose">
            <Markdown remarkPlugins={[remarkGfm]} components={components}>
              {linkCitations(content, sources.length)}
            </Markdown>
            {streaming && <span className="caret" aria-hidden />}
          </div>
        ) : streaming ? (
          <div className="thinking" aria-live="polite">
            <span /><span /><span />
            <em>{sources.length ? "Writing answer" : "Searching the document"}</em>
          </div>
        ) : null}
        {sources.length > 0 && !streaming && (
          <div className="msg-sources">
            {sources.map((s) => (
              <button
                key={s.n}
                type="button"
                className={`source-pill ${activeCite === s.n ? "active" : ""}`}
                onClick={() => onCite?.(s.n)}
              >
                <b>{s.n}</b> {pageLabel(s.pageStart, s.pageEnd)}
              </button>
            ))}
          </div>
        )}
        {model && !streaming && <p className="msg-model">Answered by {shortModel(model)}</p>}
      </div>
    </div>
  );
}
