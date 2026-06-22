import { describe, it, expect } from "vitest";
import {
  safeDiv,
  marginPct,
  cagrPct,
  growthPct,
  median,
  percentileRank,
  round,
} from "./math";

describe("safeDiv", () => {
  it("divides normally", () => expect(safeDiv(10, 2)).toBe(5));
  it("returns null on zero denominator", () =>
    expect(safeDiv(10, 0)).toBeNull());
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
    // 100 -> 200 over 1 year = 100%
    expect(round(cagrPct(100, 200, 1))).toBe(100);
    // 100 -> 400 over 2 years = 100%
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

describe("median", () => {
  it("odd length", () => expect(median([3, 1, 2])).toBe(2));
  it("even length averages middle two", () =>
    expect(median([1, 2, 3, 4])).toBe(2.5));
  it("empty -> null", () => expect(median([])).toBeNull());
});

describe("percentileRank", () => {
  it("max value is 100th percentile", () =>
    expect(percentileRank(10, [2, 4, 6, 8, 10])).toBe(100));
  it("min value low percentile", () =>
    expect(percentileRank(2, [2, 4, 6, 8, 10])).toBe(20));
  it("null without history", () =>
    expect(percentileRank(5, [])).toBeNull());
});
