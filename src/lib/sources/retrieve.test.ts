import { describe, it, expect } from "vitest";
import { retrieve, tokenize } from "./retrieve";

const chunks = [
  { id: "a", text: "The company has a strong moat from network effects and switching costs." },
  { id: "b", text: "Revenue grew rapidly but gross margins compressed due to competition." },
  { id: "c", text: "Management returned cash via buybacks and reduced the share count." },
];

describe("tokenize", () => {
  it("lowercases, strips punctuation, drops stopwords and short tokens", () => {
    const t = tokenize("The Company's MOAT, is strong!");
    expect(t).toContain("company");
    expect(t).toContain("moat");
    expect(t).toContain("strong");
    expect(t).not.toContain("the");
    expect(t).not.toContain("is");
  });
});

describe("retrieve (BM25)", () => {
  it("ranks the most relevant chunk first", () => {
    const r = retrieve(chunks, "moat network effects switching costs", 3);
    expect(r[0].id).toBe("a");
  });

  it("matches the margin/competition chunk for a margin query", () => {
    const r = retrieve(chunks, "gross margin competition", 3);
    expect(r[0].id).toBe("b");
  });

  it("returns nothing for a query with no overlapping terms", () => {
    const r = retrieve(chunks, "zzzz qqqq", 3);
    expect(r).toHaveLength(0);
  });

  it("respects topK", () => {
    const r = retrieve(chunks, "company revenue cash", 1);
    expect(r.length).toBeLessThanOrEqual(1);
  });

  it("handles empty corpus", () => {
    expect(retrieve([], "anything")).toEqual([]);
  });
});
