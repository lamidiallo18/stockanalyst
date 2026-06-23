// Pure text chunking. Splits extracted document text into overlapping chunks
// suitable for retrieval, preserving page numbers where the extractor provides
// them. No I/O — unit-tested.

export interface TextSegment {
  page?: number;
  text: string;
}

export interface Chunk {
  idx: number;
  text: string;
  page?: number;
}

export interface ChunkOptions {
  maxChars?: number; // target chunk size
  overlapChars?: number; // overlap between consecutive chunks
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// Greedily packs paragraphs into chunks up to maxChars, splitting overly long
// paragraphs on sentence boundaries, and carries a small character overlap.
export function chunkSegments(
  segments: TextSegment[],
  opts: ChunkOptions = {},
): Chunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlapChars ?? 150;
  const chunks: Chunk[] = [];
  let idx = 0;

  for (const seg of segments) {
    const text = normalize(seg.text);
    if (!text) continue;
    const paras = text.split(/\n{2,}/);
    let buf = "";

    const flush = () => {
      const t = buf.trim();
      if (t) {
        chunks.push({ idx: idx++, text: t, page: seg.page });
        buf = overlap > 0 ? t.slice(Math.max(0, t.length - overlap)) : "";
      } else {
        buf = "";
      }
    };

    for (const para of paras) {
      const p = para.trim();
      if (!p) continue;
      if (p.length > maxChars) {
        // Split a long paragraph on sentence boundaries.
        const sentences = p.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          if (buf.length + s.length + 1 > maxChars) flush();
          buf += (buf ? " " : "") + s;
        }
      } else {
        if (buf.length + p.length + 2 > maxChars) flush();
        buf += (buf ? "\n\n" : "") + p;
      }
    }
    flush();
  }

  return chunks;
}
