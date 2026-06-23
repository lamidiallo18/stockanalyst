import { describe, it, expect } from "vitest";
import { buildSourcesContext, extractCitationMarkers } from "./sources-context";

describe("buildSourcesContext", () => {
  it("returns null with no chunks", () => {
    expect(buildSourcesContext([])).toBeNull();
  });

  it("numbers chunks as S1..Sn and maps markers to chunk ids", () => {
    const ctx = buildSourcesContext([
      { id: "c1", text: "Switching costs are high.", filename: "report.pdf", page: 3, score: 2 },
      { id: "c2", text: "TAM is expanding.", filename: "deck.pdf", score: 1 },
    ])!;
    expect(ctx.markers.map((m) => m.marker)).toEqual(["S1", "S2"]);
    expect(ctx.byMarker["S1"].chunkId).toBe("c1");
    expect(ctx.block).toContain("[S1]");
    expect(ctx.block).toContain("report.pdf p.3");
  });
});

describe("extractCitationMarkers", () => {
  it("finds distinct [S#] markers in text", () => {
    const m = extractCitationMarkers("Strong moat [S1]. Growth is real [S2], per the deck [S1].");
    expect(m.sort()).toEqual(["S1", "S2"]);
  });
  it("returns empty when none present", () => {
    expect(extractCitationMarkers("No citations here.")).toEqual([]);
  });
});
