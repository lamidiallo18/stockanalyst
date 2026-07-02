import { describe, it, expect } from "vitest";
import {
  safeDiv,
  marginPct,
  cagrPct,
  growthPct,
  median,
  percentileRank,
  stdev,
  annualizedVolPct,
  round,
} from "./math";

describe("safeDiv", () => {
  it("divides normally", () => expect(safeDiv(10, 2)).toBe(5));
  it("returns null on zero denominator", () => expect(safeDiv(10, 0)).toBeNull());
  it("returns null on missing inputs", () => {
    expect(safeDiv(null, 2)).toBeNull();
    expect(safeDiv(10, undefined)).toBeNull();
  });
});

describe("marginPct", () => {
  it("computes a percentage", () => expect(marginPct(25, 100)).toBe(25));
  it("handles negatives", () => expect(marginPct(-10, 100)).toBe(-10));
  it("null when whole missing", () => expect(marginPct(10, null)).toBeNull());
});

describe("cagrPct", () => {
  it("computes compound growth", () => {
    expect(round(cagrPct(100, 200, 1))).toBe(100);
    expect(round(cagrPct(100, 400, 2))).toBe(100);
  });
  it("is undefined for non-positive base", () => {
    expect(cagrPct(0, 100, 3)).toBeNull();
    expect(cagrPct(-5, 100, 3)).toBeNull();
  });
});

describe("growthPct", () => {
  it("computes simple growth", () => expect(growthPct(100, 120)).toBe(20));
  it("uses abs of base for sign sanity", () =>
    expect(growthPct(-100, -50)).toBe(50));
  it("null on zero base", () => expect(growthPct(0, 50)).toBeNull());
});

describe("median / percentileRank", () => {
  it("odd length", () => expect(median([3, 1, 2])).toBe(2));
  it("even length averages middle two", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("max value is 100th percentile", () =>
    expect(percentileRank(10, [2, 4, 6, 8, 10])).toBe(100));
  it("null without history", () => expect(percentileRank(5, [])).toBeNull());
});

describe("stdev", () => {
  it("computes sample stdev", () => {
    expect(round(stdev([2, 4, 4, 4, 5, 5, 7, 9])!, 3)).toBeCloseTo(2.138, 2);
  });
  it("null with <2 values", () => expect(stdev([1])).toBeNull());
});

describe("annualizedVolPct", () => {
  it("null with fewer than 60 closes", () => {
    expect(annualizedVolPct(Array(30).fill(100))).toBeNull();
  });
  it("zero for a flat series", () => {
    const flat = Array(120).fill(100);
    expect(annualizedVolPct(flat)).toBe(0);
  });
  it("computes a plausible vol for an alternating series", () => {
    // +1% / -1% daily alternation -> ~16% annualized (0.01 * sqrt(252) ≈ 0.159)
    const closes: number[] = [100];
    for (let i = 0; i < 120; i++) {
      closes.push(closes[closes.length - 1] * (i % 2 === 0 ? 1.01 : 0.99));
    }
    const vol = annualizedVolPct(closes)!;
    expect(vol).toBeGreaterThan(10);
    expect(vol).toBeLessThan(25);
  });
});
