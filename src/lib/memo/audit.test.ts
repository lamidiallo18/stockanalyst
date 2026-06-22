import { describe, it, expect } from "vitest";
import { auditText } from "./audit";

describe("auditText", () => {
  const known = new Set(["60", "30.5", "15.1", "3.05T", "25"]);

  it("flags numbers not present in the known set", () => {
    const r = auditText("Margins are 60% but revenue grew 87% last year.", known);
    expect(r.unverified).toContain("87%");
    expect(r.unverified).not.toContain("60%");
  });

  it("ignores years and small list integers", () => {
    const r = auditText("In 2023 there were 3 catalysts and 5 risks.", known);
    expect(r.unverified).toEqual([]);
  });

  it("matches compact money units", () => {
    const r = auditText("Market cap is $3.05T today.", known);
    expect(r.unverified).toEqual([]);
  });

  it("matches multiples written with x", () => {
    const r = auditText("It trades at 25x earnings.", known);
    expect(r.unverified).toEqual([]);
  });

  it("counts total numeric tokens considered", () => {
    const r = auditText("Up 99% with 60% margins.", known);
    expect(r.total).toBe(2);
    expect(r.unverified).toContain("99%");
  });
});
