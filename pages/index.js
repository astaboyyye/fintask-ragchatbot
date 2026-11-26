import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import PdfUploader from "../components/PdfUploader";
import PipelineSteps from "../components/PipelineSteps";
import DocumentCard from "../components/DocumentCard";
import { fetchJSON } from "../utils/client";

const IDLE = { active: -1, activeTo: undefined, failedAt: -1 };

export default function HomePage() {
  const router = useRouter();
  const [steps, setSteps] = useState(IDLE);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);

  const loadRecent = () =>
    fetchJSON("/api/documents")
      .then((d) => setRecent(d.documents.slice(0, 3)))
      .catch(() => {});

  useEffect(() => {
    loadRecent();
  }, []);

  async function handleUpload(file) {
    setBusy(true);
    setError("");
    setResult(null);
    let stage = 0;
    try {
      // Steps 1-2: upload + extract (one request)
      setSteps({ active: 0, activeTo: 1, failedAt: -1 });
      setStatus(`Uploading ${file.name} and extracting text…`);
      const form = new FormData();
      form.append("file", file);
      const uploaded = await fetchJSON("/api/upload", { method: "POST", body: form });

      // Same PDF uploaded before and still indexed: reuse its stored embeddings.
      const doc = uploaded.document;
      if (uploaded.duplicate && doc.status === "READY" && !doc.needsReindex) {
        setSteps({ active: 5, activeTo: 4, failedAt: -1 });
        setStatus("");
        setResult({
          document: doc,
          reused: true,
          stats: { chunks: doc.chunkCount, dimensions: 1536 },
          timings: { chunkMs: 0, embedMs: 0, storeMs: 0 },
          extractMs: 0,
        });
        loadRecent();
        return;
      }

      // Steps 3-5: chunk + embed + store (one request)
      stage = 2;
      setSteps({ active: 2, activeTo: 4, failedAt: -1 });
      setStatus(`Extracted ${uploaded.document.pageCount} pages. Chunking, embedding and storing vectors…`);
      const processed = await fetchJSON("/api/process", {
        method: "POST",
        body: JSON.stringify({ documentId: uploaded.document.id }),
      });

      setSteps({ active: 5, activeTo: 4, failedAt: -1 });
      setStatus("");
      setResult({ ...processed, extractMs: uploaded.timings.extractMs });
      loadRecent();
    } catch (err) {
      setSteps({ active: stage, activeTo: stage - 1, failedAt: stage });
      setStatus("");
      setError(err.message);
      loadRecent();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <section className="hero">
        <p className="eyebrow">Document RAG chatbot</p>
        <h1>Ask questions about any PDF.</h1>
        <p className="lede">
          Upload a document and DocQuery splits it into passages, embeds them into a vector database,
          and answers your questions with an LLM, citing the pages each answer came from.
        </p>
      </section>

      <section className="card upload-card">
        <PdfUploader onUpload={handleUpload} disabled={busy} />
        <div className="pipeline-wrap">
          <h2 className="card-title">RAG pipeline</h2>
          <PipelineSteps {...steps} />
          {status && <p className="status-line" aria-live="polite"><span className="spinner" /> {status}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        {result && (
          <div className="result">
            <div className="result-text">
              <h3>“{result.document.title}” is ready</h3>
              {result.reused && (
                <p className="subtle small reused-note">
                  You uploaded this PDF before, so its stored embeddings were reused (no new API calls).
                </p>
              )}
              <dl className="stats">
                <div><dt>Pages</dt><dd>{result.document.pageCount}</dd></div>
                <div><dt>Chunks</dt><dd>{result.stats.chunks}</dd></div>
                <div><dt>Tokens</dt><dd>{result.document.tokenCount.toLocaleString()}</dd></div>
                <div><dt>Vector dims</dt><dd>{result.stats.dimensions}</dd></div>
                <div>
                  <dt>Time</dt>
                  <dd>{((result.extractMs + result.timings.chunkMs + result.timings.embedMs + result.timings.storeMs) / 1000).toFixed(1)}s</dd>
                </div>
              </dl>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => router.push(`/chat/${result.document.id}`)}>
              Start chatting →
            </button>
          </div>
        )}
      </section>

      <section className="concepts">
        {[
          ["Chunking", "500-token windows with 50 tokens of overlap, so a sentence cut at a boundary still appears whole in one chunk."],
          ["Embeddings", "Each chunk becomes a 1536-dimension embedding vector, stored in Postgres with pgvector."],
          ["Retrieval", "Your question is embedded the same way, and the 5 chunks closest by cosine similarity become the model's context."],
          ["Grounded answers", "The model streams its answer over Server-Sent Events and cites the passages it used, with page numbers."],
        ].map(([title, text]) => (
          <div key={title} className="concept">
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Recent documents</h2>
            <Link href="/documents" className="link">View all →</Link>
          </div>
          <div className="doc-grid">
            {recent.map((doc) => (
              <DocumentCard key={doc.id} document={doc} />
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
