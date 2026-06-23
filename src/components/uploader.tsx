"use client";

import { useRef, useState } from "react";
import { Button, Muted } from "@/components/ui/primitives";

export interface UploadedSource {
  id: string;
  filename: string;
  kind: string;
  extractionStatus: string;
}

// Drag-and-drop / click uploader. Posts each file to /api/sources and reports
// the created Source. Optionally scopes the upload to an analysis.
export function Uploader({
  analysisId,
  onUploaded,
}: {
  analysisId?: string;
  onUploaded?: (s: UploadedSource) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        if (analysisId) fd.append("analysisId", analysisId);
        const res = await fetch("/api/sources", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `Failed to upload ${file.name}`);
        } else if (onUploaded) {
          onUploaded(json.source);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm transition-colors ${
          drag ? "border-[var(--accent)] bg-[var(--accent)]/10" : "text-[var(--muted)] hover:border-[var(--accent)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.docx,.txt,.md,.csv,.html,.png,.jpg,.jpeg,.webp"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
        {busy ? "Uploading…" : drag ? "Drop files to upload" : "Drag files here or click to upload"}
        <Muted className="mt-1 block text-xs">
          PDF, DOCX, TXT/MD, CSV, HTML, images (OCR). Stored locally, extracted automatically.
        </Muted>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--negative)]">{error}</p>}
    </div>
  );
}

export function ExtractionBadge({ status }: { status: string }) {
  const tone =
    status === "DONE" ? "positive" : status === "FAILED" ? "negative" : "warning";
  const colors: Record<string, string> = {
    positive: "bg-[var(--positive)]/15 text-[var(--positive)]",
    negative: "bg-[var(--negative)]/15 text-[var(--negative)]",
    warning: "bg-[var(--warning)]/15 text-[var(--warning)]",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${colors[tone]}`}>
      {status.toLowerCase()}
    </span>
  );
}
