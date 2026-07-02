// Test obligations from docs/normalization-policy.md §5.
import { describe, it, expect } from "vitest";
import { reconcileFinancials } from "./reconcile";
import type { NormalizedFinancials, NormalizedPeriod } from "@/lib/plugins/types";

function fy(date: string, over: Partial<NormalizedPeriod>): NormalizedPeriod {
  return { periodType: "FY", fiscalDate: date, ...over };
}

const fmp: NormalizedFinancials = {
  ticker: "T",
  periods: [
    fy("2023-09-30", { revenue: 1000, netIncome: 200, ebitda: 350, cash: 100 }),
    fy("2022-09-30", { revenue: 900, netIncome: 180 }),
  ],
};

describe("reconcileFinancials", () => {
  it("no EDGAR data -> FMP passes through untouched", () => {
    const r = reconcileFinancials(fmp, null);
    expect(r.financials).toEqual(fmp);
    expect(r.discrepancies).toEqual([]);
  });

  it("fills FMP gaps from EDGAR", () => {
    const edgar: NormalizedFinancials = {
      ticker: "T",
      periods: [fy("2023-09-30", { revenue: 1000, totalEquity: 500 })],
    };
    const r = reconcileFinancials(fmp, edgar);
    expect(r.financials.periods[0].totalEquity).toBe(500);
    expect(r.filled).toBe(1);
    expect(r.discrepancies).toEqual([]);
  });

  it("<=2% disagreement: FMP value stands, no discrepancy", () => {
    const edgar: NormalizedFinancials = {
      ticker: "T",
      periods: [fy("2023-09-30", { revenue: 1015 })], // 1.5% apart
    };
    const r = reconcileFinancials(fmp, edgar);
    expect(r.financials.periods[0].revenue).toBe(1000);
    expect(r.discrepancies).toEqual([]);
  });

  it(">2% disagreement: EDGAR wins, FMP value stored + surfaced", () => {
    const edgar: NormalizedFinancials = {
      ticker: "T",
      periods: [fy("2023-09-30", { revenue: 1100 })], // ~9% apart
    };
    const r = reconcileFinancials(fmp, edgar);
    expect(r.financials.periods[0].revenue).toBe(1100); // EDGAR authoritative
    expect(r.discrepancies).toHaveLength(1);
    const d = r.discrepancies[0];
    expect(d.field).toBe("revenue");
    expect(d.chosenProvider).toBe("edgar");
    expect(d.chosenValue).toBe(1100);
    expect(d.otherProvider).toBe("fmp");
    expect(d.otherValue).toBe(1000); // never discarded
    expect(d.pctDiff).toBeGreaterThan(2);
  });

  it("matches periods by fiscal year despite end-date drift", () => {
    const edgar: NormalizedFinancials = {
      ticker: "T",
      // EDGAR reports FYE 2023-10-01 vs FMP's 2023-09-30 — same fiscal year.
      periods: [fy("2023-10-01", { revenue: 1100 })],
    };
    const r = reconcileFinancials(fmp, edgar);
    expect(r.financials.periods[0].revenue).toBe(1100);
    expect(r.discrepancies).toHaveLength(1);
  });

  it("derived fields (ebitda) are exempt from override", () => {
    const edgar: NormalizedFinancials = {
      ticker: "T",
      // EDGAR has no EBITDA concept; even if a period carried one, the field
      // is not in the reconciled set.
      periods: [fy("2023-09-30", { ebitda: 999 })],
    };
    const r = reconcileFinancials(fmp, edgar);
    expect(r.financials.periods[0].ebitda).toBe(350); // FMP value untouched
    expect(r.discrepancies).toEqual([]);
  });

  it("multiple fields reconcile independently in one period", () => {
    const edgar: NormalizedFinancials = {
      ticker: "T",
      periods: [
        fy("2023-09-30", { revenue: 1001, netIncome: 240, totalDebt: 50 }),
      ],
    };
    const r = reconcileFinancials(fmp, edgar);
    expect(r.financials.periods[0].revenue).toBe(1000); // 0.1% -> FMP stands
    expect(r.financials.periods[0].netIncome).toBe(240); // 20% -> EDGAR wins
    expect(r.financials.periods[0].totalDebt).toBe(50); // fill
    expect(r.discrepancies).toHaveLength(1);
    expect(r.filled).toBe(1);
  });
});
