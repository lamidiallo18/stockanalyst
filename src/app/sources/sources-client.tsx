"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle, Muted, Button } from "@/components/ui/primitives";
import { Uploader, ExtractionBadge } from "@/components/uploader";

interface Source {
  id: string;
  kind: string;
  filename: string;
  byteSize: number | null;
  extractionStatus: string;
  chunkCount: number;
  uploadedAt: string;
}

export function SourcesClient() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sources");
    const json = await res.json();
    setSources(json.sources ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any source is still extracting.
  useEffect(() => {
    if (!sources.some((s) => s.extractionStatus === "PENDING")) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [sources, load]);

  async function remove(id: string) {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Upload sources</CardTitle>
        <div className="mt-3">
          <Uploader onUploaded={() => setTimeout(load, 300)} />
        </div>
      </Card>

      <Card>
        <CardTitle>Library</CardTitle>
        {loading ? (
          <Muted className="mt-3 block">Loading…</Muted>
        ) : sources.length === 0 ? (
          <Muted className="mt-3 block text-sm">
            No sources yet. Upload a PDF, article, or transcript above.
          </Muted>
        ) : (
          <div className="mt-3 space-y-2">
            {sources.map((s) => (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.filename}</span>
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                      {s.kind}
                    </span>
                    <ExtractionBadge status={s.extractionStatus} />
                    {s.extractionStatus === "DONE" && (
                      <Muted className="text-xs">{s.chunkCount} chunks</Muted>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.extractionStatus === "DONE" && (
                      <Button
                        variant="ghost"
                        onClick={() => setOpenId(openId === s.id ? null : s.id)}
                      >
                        {openId === s.id ? "Hide text" : "View text"}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => remove(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {openId === s.id && <SourceText id={s.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SourceText({ id }: { id: string }) {
  const [chunks, setChunks] = useState<{ idx: number; page: number | null; text: string }[] | null>(null);
  useEffect(() => {
    fetch(`/api/sources/${id}`)
      .then((r) => r.json())
      .then((j) => setChunks(j.source?.chunks ?? []));
  }, [id]);
  if (!chunks) return <Muted className="mt-2 block text-xs">Loading text…</Muted>;
  return (
    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto border-t pt-3">
      {chunks.map((c) => (
        <div key={c.idx} className="text-xs text-[var(--muted)]">
          {c.page && <span className="mr-2 text-[var(--accent)]">p.{c.page}</span>}
          {c.text}
        </div>
      ))}
    </div>
  );
}
