import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import Layout from "../../components/Layout";
import ChatMessage from "../../components/ChatMessage";
import ChunkSourceList from "../../components/ChunkSourceList";
import PipelineSteps from "../../components/PipelineSteps";
import { fetchJSON, streamChat } from "../../utils/client";

const SUGGESTIONS = [
  "Summarize this document in five bullet points.",
  "What are the key numbers or figures mentioned?",
  "What conclusions or recommendations does it make?",
];

export default function ChatDocPage() {
  const router = useRouter();
  const { docId } = router.query;
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(-1); // pipeline step while answering: 5 search, 6 answer
  const [focus, setFocus] = useState({ msg: null, cite: null }); // which answer's sources are shown
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!docId) return;
    fetchJSON(`/api/documents/${docId}`)
      .then((d) => {
        setDoc(d.document);
        setMessages(d.messages.map((m) => ({ ...m, sources: m.sources || [] })));
      })
      .catch((e) => setLoadError(e.message));
    return () => abortRef.current?.abort();
  }, [docId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const updateLast = (fn) =>
    setMessages((ms) => {
      const copy = ms.slice();
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setPhase(5);
    const assistantIndex = messages.length + 1;
    setMessages((ms) => [
      ...ms,
      { id: `u-${Date.now()}`, role: "user", content: q },
      { id: `a-${Date.now()}`, role: "assistant", content: "", sources: [], streaming: true },
    ]);
    setFocus({ msg: assistantIndex, cite: null });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({
        documentId: docId,
        question: q,
        signal: controller.signal,
        onEvent(event, data) {
          if (event === "sources") {
            setPhase(6);
            updateLast((m) => ({ ...m, sources: data }));
          } else if (event === "delta") {
            updateLast((m) => ({ ...m, content: m.content + data.text }));
          } else if (event === "reset") {
            updateLast((m) => ({ ...m, content: "" }));
          } else if (event === "done") {
            updateLast((m) => ({ ...m, id: data.messageId, model: data.model, streaming: false }));
          } else if (event === "error") {
            updateLast((m) => ({ ...m, streaming: false, error: data.message }));
          }
        },
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        updateLast((m) => ({ ...m, streaming: false, error: err.message }));
      }
    } finally {
      updateLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
      setPhase(-1);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  // Sources panel follows the focused answer, defaulting to the latest one.
  const lastAssistant = messages.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0).pop();
  const focusIdx = focus.msg ?? lastAssistant;
  const panelSources = focusIdx != null ? messages[focusIdx]?.sources || [] : [];

  if (loadError) {
    return (
      <Layout title="Chat">
        <div className="card empty">
          <h3>{loadError}</h3>
          <Link href="/documents" className="btn btn-primary">Back to documents</Link>
        </div>
      </Layout>
    );
  }

  const ready = doc?.status === "READY" && !doc?.needsReindex;

  return (
    <Layout title={doc?.title || "Chat"} wide>
      <div className="chat-layout">
        <section className="chat-main card">
          <header className="chat-head">
            <div className="chat-head-text">
              <Link href="/documents" className="link small">← Documents</Link>
              <h1 className="chat-title">{doc?.title || "Loading…"}</h1>
              {doc && (
                <p className="subtle small">
                  {doc.pageCount} pages · {doc.chunkCount} chunks · {doc.tokenCount.toLocaleString()} tokens indexed
                </p>
              )}
            </div>
            <PipelineSteps
              compact
              active={phase !== -1 ? phase : !ready ? 0 : messages.some((m) => m.role === "assistant" && m.content) ? 7 : 5}
            />
          </header>

          <div className="chat-scroll">
            {doc && !ready && (
              <p className="form-error">
                {doc.needsReindex
                  ? "This document was indexed with a different embedding model. Re-index it from the Documents page."
                  : `This document isn't ready (${doc.status.toLowerCase()}). Process it from the Documents page.`}
              </p>
            )}
            {ready && messages.length === 0 && (
              <div className="chat-empty">
                <h2>What do you want to know?</h2>
                <p className="subtle">Answers are drawn from the document and cite the passages they use.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="suggestion" onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={m.id}>
                <ChatMessage
                  role={m.role}
                  content={m.content}
                  sources={m.sources}
                  streaming={m.streaming}
                  model={m.model}
                  activeCite={focusIdx === i ? focus.cite : null}
                  onCite={(n) => setFocus({ msg: i, cite: n })}
                />
                {m.error && <p className="form-error msg-error" role="alert">{m.error}</p>}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              maxLength={2000}
              placeholder={ready ? "Ask about this document…" : "Waiting for the document…"}
              disabled={!ready}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn btn-ghost" onClick={stop}>Stop</button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!ready || !input.trim()}>Ask</button>
            )}
          </form>
        </section>

        <aside className="sources-panel card">
          <h2 className="card-title">Retrieved passages</h2>
          <p className="subtle small">Top 5 chunks by cosine similarity to the question.</p>
          <ChunkSourceList
            sources={panelSources}
            active={focus.cite}
            onSelect={(n) => setFocus({ msg: focusIdx, cite: n })}
          />
        </aside>
      </div>
    </Layout>
  );
}
