import { describe, it, expect } from "vitest";
import { chunkSegments } from "./chunk";

describe("chunkSegments", () => {
  it("returns one chunk for short text", () => {
    const chunks = chunkSegments([{ text: "Short note about the company." }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].idx).toBe(0);
  });

  it("preserves page numbers per segment", () => {
    const chunks = chunkSegments([
      { page: 1, text: "First page content." },
      { page: 2, text: "Second page content." },
    ]);
    expect(chunks[0].page).toBe(1);
    expect(chunks[1].page).toBe(2);
  });

  it("splits long text into multiple ordered chunks", () => {
    const para = "Sentence about revenue and margins. ".repeat(50); // ~1850 chars
    const chunks = chunkSegments([{ text: para }], { maxChars: 500, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.idx).toBe(i));
    // No chunk wildly exceeds the target size.
    for (const c of chunks) expect(c.text.length).toBeLessThan(800);
  });

  it("skips empty segments", () => {
    const chunks = chunkSegments([{ text: "   " }, { text: "Real content." }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Real content.");
  });
});
