import { describe, it, expect } from "vitest";
import { computeScores } from "./engine";
import { computePacket } from "@/lib/calc/engine";
import type { NormalizedFinancials, NormalizedPeriod } from "@/lib/plugins/types";

function fy(date: string, over: Partial<NormalizedPeriod>): NormalizedPeriod {
  return { periodType: "FY", fiscalDate: date, ...over };
}

// A high-quality compounder: fat margins, strong ROIC, low leverage, growth.
const strong: NormalizedFinancials = {
  ticker: "STRONG",
  periods: [
    fy("2023-12-31", {
      revenue: 1000, grossProfit: 750, opIncome: 400, ebitda: 450,
      netIncome: 320, pretaxIncome: 400, incomeTax: 80,
      ocf: 380, capex: 30, totalDebt: 50, cash: 300, totalEquity: 600, shares: 95,
    }),
    fy("2022-12-31", { revenue: 820, shares: 97 }),
    fy("2021-12-31", { revenue: 680, shares: 99 }),
    fy("2020-12-31", { revenue: 520, shares: 100 }),
  ],
};

const strongPacket = computePacket({
  profile: { ticker: "STRONG", name: "Strong Co" },
  quote: { ticker: "STRONG", asOf: "2024-01-01T00:00:00Z", price: 100, marketCap: 8000 },
  financials: strong,
  now: new Date("2024-01-02T00:00:00Z"),
});

describe("computeScores", () => {
  it("produces all 10 categories with a composite", () => {
    const r = computeScores(strongPacket);
    expect(r.scores).toHaveLength(10);
    expect(r.composite).toBeGreaterThan(0);
    expect(r.composite).toBeLessThanOrEqual(100);
  });

  it("rewards a high-quality business with a strong business_quality score", () => {
    const r = computeScores(strongPacket);
    const bq = r.scores.find((s) => s.category === "business_quality")!;
    expect(bq.value).toBeGreaterThanOrEqual(70);
    expect(["A", "B"]).toContain(bq.letter);
  });

  it("financial_strength is high for low leverage + strong FCF", () => {
    const r = computeScores(strongPacket);
    const fs = r.scores.find((s) => s.category === "financial_strength")!;
    expect(fs.value).toBeGreaterThanOrEqual(70);
  });

  it("flags qualitative categories as needing judgment", () => {
    const r = computeScores(strongPacket);
    const moat = r.scores.find((s) => s.category === "moat_durability")!;
    expect(moat.needsQualitative).toBe(true);
    expect(moat.evidence.length).toBeGreaterThan(0);
  });

  it("attaches transparent signals to scores", () => {
    const r = computeScores(strongPacket);
    const bq = r.scores.find((s) => s.category === "business_quality")!;
    expect(bq.signals.length).toBeGreaterThan(0);
    expect(bq.signals[0]).toHaveProperty("label");
  });

  it("thesis_confidence value is low when packet data is sparse", () => {
    const sparse = computePacket({
      profile: { ticker: "X", name: "X" },
      financials: { ticker: "X", periods: [fy("2023-12-31", { revenue: 100 })] },
    });
    const rich = computeScores(strongPacket).scores.find(
      (s) => s.category === "thesis_confidence",
    )!;
    const poor = computeScores(sparse).scores.find(
      (s) => s.category === "thesis_confidence",
    )!;
    // Sparse data should yield meaningfully lower thesis confidence than rich.
    expect(poor.value).toBeLessThan(rich.value);
    expect(poor.value).toBeLessThan(55);
  });
});
