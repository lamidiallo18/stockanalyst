import { describe, it, expect } from "vitest";
import {
  presentValue,
  solveImpliedGrowth,
  HORIZON_YEARS,
  TERMINAL_GROWTH_PCT,
} from "./reverse-dcf";

describe("reverse DCF solver", () => {
  it("recovers a known growth rate (round trip)", () => {
    // Price the company at g = 8% exactly, then solve back.
    const fcf0 = 100;
    const r = 0.1;
    const gT = TERMINAL_GROWTH_PCT / 100;
    const marketCap = presentValue(fcf0, 0.08, r, HORIZON_YEARS, gT);
    const { result } = solveImpliedGrowth({
      fcf0,
      marketCap,
      discountRatePct: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.impliedFcfCagrPct).toBeCloseTo(8, 1);
  });

  it("is deterministic (same inputs, same output)", () => {
    const a = solveImpliedGrowth({ fcf0: 50, marketCap: 2000, discountRatePct: 10 });
    const b = solveImpliedGrowth({ fcf0: 50, marketCap: 2000, discountRatePct: 10 });
    expect(a.result!.impliedFcfCagrPct).toBe(b.result!.impliedFcfCagrPct);
  });

  it("higher price implies higher growth (monotonic)", () => {
    const lo = solveImpliedGrowth({ fcf0: 100, marketCap: 2000, discountRatePct: 10 });
    const hi = solveImpliedGrowth({ fcf0: 100, marketCap: 4000, discountRatePct: 10 });
    expect(hi.result!.impliedFcfCagrPct).toBeGreaterThan(
      lo.result!.impliedFcfCagrPct,
    );
  });

  it("echoes pinned inputs for transparency", () => {
    const { result } = solveImpliedGrowth({
      fcf0: 100,
      marketCap: 3000,
      discountRatePct: 12,
    });
    expect(result!.inputs).toEqual({
      fcf0: 100,
      marketCap: 3000,
      discountRatePct: 12,
      horizonYears: HORIZON_YEARS,
      terminalGrowthPct: TERMINAL_GROWTH_PCT,
    });
  });

  it("null for non-positive FCF with a reason", () => {
    const { result, note } = solveImpliedGrowth({
      fcf0: -10,
      marketCap: 1000,
      discountRatePct: 10,
    });
    expect(result).toBeNull();
    expect(note).toContain("non-positive");
  });

  it("null when market cap missing", () => {
    expect(
      solveImpliedGrowth({ fcf0: 100, marketCap: null, discountRatePct: 10 }).result,
    ).toBeNull();
  });

  it("null when discount rate <= terminal growth", () => {
    const { result, note } = solveImpliedGrowth({
      fcf0: 100,
      marketCap: 1000,
      discountRatePct: 2,
    });
    expect(result).toBeNull();
    expect(note).toContain("must exceed");
  });

  it("null when price is outside the solvable band", () => {
    // Absurdly high price vs tiny FCF -> implied growth beyond +100%.
    const { result, note } = solveImpliedGrowth({
      fcf0: 1,
      marketCap: 10_000_000,
      discountRatePct: 10,
    });
    expect(result).toBeNull();
    expect(note).toContain("out of range");
  });
});
