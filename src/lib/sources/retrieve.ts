// Pure BM25 keyword retrieval over source chunks. Local and deterministic — no
// embedding API, so uploaded document text never leaves the machine (per the
// app's privacy stance). Unit-tested.

export interface RetrievableChunk {
  id: string;
  text: string;
  sourceId?: string;
  filename?: string;
  page?: number;
}

export interface ScoredChunk extends RetrievableChunk {
  score: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "as", "at", "by", "it",
  "its", "this", "that", "these", "those", "from", "has", "have", "had", "will",
  "would", "could", "should", "than", "then", "they", "their", "we", "our",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const K1 = 1.5;
const B = 0.75;

// Returns the top-K chunks most relevant to `query`, scored with Okapi BM25.
export function retrieve(
  chunks: RetrievableChunk[],
  query: string,
  topK = 6,
): ScoredChunk[] {
  if (chunks.length === 0) return [];
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  const docs = chunks.map((c) => tokenize(c.text));
  const N = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / N || 1;

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const d of docs) if (d.includes(term)) count++;
    df.set(term, count);
  }

  const scored: ScoredChunk[] = chunks.map((chunk, i) => {
    const doc = docs[i];
    const len = doc.length || 1;
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const n = df.get(term) ?? 0;
      // BM25 idf with +1 smoothing to stay non-negative.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const denom = f + K1 * (1 - B + (B * len) / avgLen);
      score += idf * ((f * (K1 + 1)) / denom);
    }
    return { ...chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
