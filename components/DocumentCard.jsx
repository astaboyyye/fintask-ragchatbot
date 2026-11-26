import Link from "next/link";
import { formatBytes, formatDate } from "../lib/client";

const STATUS_LABEL = {
  UPLOADED: "Waiting",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
};

export default function DocumentCard({ document: doc, onDelete, onRetry }) {
  const ready = doc.status === "READY" && !doc.needsReindex;
  return (
    <article className="doc-card">
      <div className="doc-card-head">
        <span className="doc-icon" aria-hidden>PDF</span>
        <span className={`status status-${doc.status.toLowerCase()}`}>{STATUS_LABEL[doc.status]}</span>
      </div>
      <h3 className="doc-title" title={doc.title}>{doc.title}</h3>
      <p className="doc-meta">
        {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"} · {formatBytes(doc.fileSize)}
        {doc.status === "READY" && <> · {doc.chunkCount} chunks</>}
      </p>
      <p className="doc-meta subtle">Added {formatDate(doc.createdAt)}</p>
      {doc.status === "FAILED" && doc.error && <p className="form-error small">{doc.error}</p>}
      {doc.needsReindex && (
        <p className="note small">Indexed with an older embedding model. Re-index it to chat.</p>
      )}
      <div className="doc-actions">
        {ready ? (
          <Link href={`/chat/${doc.id}`} className="btn btn-primary btn-sm">Open chat</Link>
        ) : (
          onRetry && doc.status !== "PROCESSING" && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onRetry(doc)}>
              {doc.needsReindex ? "Re-index" : "Process"}
            </button>
          )
        )}
        {onDelete && (
          <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onDelete(doc)}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
