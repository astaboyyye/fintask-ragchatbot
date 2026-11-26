import { useRef, useState } from "react";

const MAX_BYTES = 4 * 1024 * 1024;

/** Drag-and-drop PDF picker. Validates type and size before calling onUpload. */
export default function PdfUploader({ onUpload, disabled = false }) {
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const accept = (file) => {
    setError("");
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) return setError("Choose a PDF file.");
    if (file.size > MAX_BYTES) return setError("PDFs up to 4 MB are supported.");
    onUpload(file);
  };

  return (
    <div>
      <label
        className={`dropzone ${dragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          disabled={disabled}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="dropzone-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" /></svg>
        </span>
        <span className="dropzone-title">
          {disabled ? "Processing…" : <>Drop a PDF here or <u>browse</u></>}
        </span>
        <span className="dropzone-hint">Text-based PDFs up to 4 MB</span>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
