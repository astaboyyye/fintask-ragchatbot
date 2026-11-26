import Link from "next/link";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import DocumentCard from "../components/DocumentCard";
import { fetchJSON } from "../utils/client";

export default function DocumentsPage() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);

  const load = () =>
    fetchJSON("/api/documents")
      .then((d) => setDocs(d.documents))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function remove(doc) {
    setError("");
    try {
      await fetchJSON(`/api/documents/${doc.id}`, { method: "DELETE" });
      setConfirming(null);
      setDocs((d) => d.filter((x) => x.id !== doc.id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function retry(doc) {
    setError("");
    setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, status: "PROCESSING", error: null, needsReindex: false } : x)));
    try {
      await fetchJSON("/api/process", { method: "POST", body: JSON.stringify({ documentId: doc.id }) });
    } catch (e) {
      setError(e.message);
    }
    load();
  }

  return (
    <Layout title="Documents">
      <div className="section-head">
        <div>
          <h1 className="page-title">Your documents</h1>
          <p className="subtle">PDFs you've uploaded from this browser{" "}or account.</p>
        </div>
        <Link href="/" className="btn btn-primary">Upload PDF</Link>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {confirming && (
        <div className="confirm card" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete <b>{confirming.title}</b>? Its chunks, vectors and chat history are removed too.
          </p>
          <div className="doc-actions">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(confirming)}>Delete</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      )}

      {docs === null ? (
        <div className="doc-grid">
          {[0, 1, 2].map((i) => <div key={i} className="doc-card skeleton" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="card empty">
          <h3>No documents yet</h3>
          <p className="subtle">Upload a PDF to build its vector index and start asking questions.</p>
          <Link href="/" className="btn btn-primary">Upload your first PDF</Link>
        </div>
      ) : (
        <div className="doc-grid">
          {docs.map((doc) => (
            <DocumentCard key={doc.id} document={doc} onDelete={setConfirming} onRetry={retry} />
          ))}
        </div>
      )}
    </Layout>
  );
}
