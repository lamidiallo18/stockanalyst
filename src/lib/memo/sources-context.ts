// Builds the source-excerpt context block injected into prompts, plus the
// marker map used to turn inline [S#] citations the model emits back into
// Citation records. Pure — unit-tested.
import type { ScoredChunk } from "@/lib/sources/retrieve";

export interface SourceMarker {
  marker: string; // e.g. "S1"
  chunkId: string;
  sourceId?: string;
  filename?: string;
  page?: number;
}

export interface SourcesContext {
  block: string; // formatted excerpts for the prompt
  markers: SourceMarker[];
  byMarker: Record<string, SourceMarker>;
}

const EXCERPT_CHARS = 800;

export function buildSourcesContext(chunks: ScoredChunk[]): SourcesContext | null {
  if (chunks.length === 0) return null;
  const markers: SourceMarker[] = [];
  const lines: string[] = [
    "UPLOADED SOURCE EXCERPTS (cite inline as [S#] when a claim is supported by one):",
  ];
  chunks.forEach((c, i) => {
    const marker = `S${i + 1}`;
    markers.push({
      marker,
      chunkId: c.id,
      sourceId: c.sourceId,
      filename: c.filename,
      page: c.page,
    });
    const loc = c.filename
      ? `${c.filename}${c.page ? ` p.${c.page}` : ""}`
      : "source";
    lines.push(`[${marker}] (${loc}) ${c.text.slice(0, EXCERPT_CHARS).replace(/\s+/g, " ").trim()}`);
  });
  const byMarker = Object.fromEntries(markers.map((m) => [m.marker, m]));
  return { block: lines.join("\n\n"), markers, byMarker };
}

// Extracts the distinct [S#] markers actually used in a piece of generated text.
export function extractCitationMarkers(text: string): string[] {
  const found = new Set<string>();
  const re = /\[(S\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[1]);
  return [...found];
}
