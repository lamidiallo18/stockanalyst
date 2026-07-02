import { describe, it, expect } from "vitest";
import { suggestSize } from "./engine";

const base = {
  riskScore: 50,
  realizedVolPct: 25,
  maxSingleNamePct: 8,
  targetVolPct: 25,
};

describe("suggestSize", () => {
  it("is deterministic", () => {
    const a = suggestSize({ confidence: "MEDIUM", ...base });
    const b = suggestSize({ confidence: "MEDIUM", ...base });
    expect(a).toEqual(b);
  });

  it("higher confidence -> larger size", () => {
    const lo = suggestSize({ confidence: "LOW", ...base });
    const hi = suggestSize({ confidence: "HIGH", ...base });
    expect(hi.highPct).toBeGreaterThan(lo.highPct);
  });

  it("higher volatility -> smaller size", () => {
    const calm = suggestSize({ confidence: "MEDIUM", ...base, realizedVolPct: 15 });
    const wild = suggestSize({ confidence: "MEDIUM", ...base, realizedVolPct: 60 });
    expect(wild.highPct).toBeLessThan(calm.highPct);
  });

  it("lower risk score (riskier) -> smaller size", () => {
    const risky = suggestSize({ confidence: "MEDIUM", ...base, riskScore: 20 });
    const safe = suggestSize({ confidence: "MEDIUM", ...base, riskScore: 90 });
    expect(risky.highPct).toBeLessThan(safe.highPct);
  });

  it("never exceeds the single-name cap", () => {
    const r = suggestSize({
      confidence: "HIGH",
      riskScore: 100,
      realizedVolPct: 10, // volAdj would exceed 1 but is clamped at 1.2
      maxSingleNamePct: 8,
      targetVolPct: 25,
    });
    expect(r.highPct).toBeLessThanOrEqual(8);
    expect(r.lowPct).toBeLessThanOrEqual(r.highPct);
  });

  it("missing vol -> proxy flag and neutral volAdj, disclosed in rationale", () => {
    const r = suggestSize({ confidence: "MEDIUM", ...base, realizedVolPct: null });
    expect(r.usedVolProxy).toBe(true);
    expect(r.rationale).toContain("PROXY");
  });

  it("rationale shows the full formula and the correlation deferral", () => {
    const r = suggestSize({ confidence: "HIGH", ...base });
    expect(r.rationale).toContain("base");
    expect(r.rationale).toContain("risk");
    expect(r.rationale).toContain("vol");
    expect(r.rationale).toContain("Correlation");
  });
});
