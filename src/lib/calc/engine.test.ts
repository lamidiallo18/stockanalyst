import { describe, it, expect } from "vitest";
import { computePacket, type CalcInput } from "./engine";
import type {
  NormalizedFinancials,
  NormalizedPeriod,
} from "@/lib/plugins/types";

// Synthetic company with clean round numbers so expected outputs are exact.
function fy(date: string, over: Partial<NormalizedPeriod>): NormalizedPeriod {
  return { periodType: "FY", fiscalDate: date, ...over };
}

const financials: NormalizedFinancials = {
  ticker: "TEST",
  periods: [
    fy("2023-12-31", {
      revenue: 1000,
      grossProfit: 600,
      opIncome: 300,
      ebitda: 350,
      netIncome: 200,
      pretaxIncome: 250,
      incomeTax: 50, // effective tax = 20%
      ocf: 280,
      capex: 80, // fcf = 280 - 80 = 200
      totalDebt: 400,
      cash: 100,
      totalEquity: 500,
      shares: 100,
    }),
    fy("2022-12-31", { revenue: 900, shares: 102 }),
    fy("2021-12-31", { revenue: 800, shares: 105 }),
    fy("2020-12-31", { revenue: 500, shares: 110 }), // 3y ago
    fy("2019-12-31", { revenue: 450, shares: 112 }),
    fy("2018-12-31", { revenue: 400, shares: 115 }), // 5y ago
  ],
};

const baseInput: CalcInput = {
  profile: { ticker: "TEST", name: "Test Corp", sector: "Tech" },
  quote: {
    ticker: "TEST",
    asOf: "2024-01-01T00:00:00.000Z",
    price: 50,
    marketCap: 5000,
  },
  financials,
  historicalRatios: [
    { fiscalDate: "2021-12-31", pe: 20 },
    { fiscalDate: "2022-12-31", pe: 30 },
    { fiscalDate: "2023-12-31", pe: 25 },
  ],
  now: new Date("2024-01-02T00:00:00.000Z"), // 1 day after quote -> fresh
};

describe("computePacket — margins", () => {
  const p = computePacket(baseInput);
  it("gross/op/net/fcf margins", () => {
    expect(p.metrics.grossMargin.value).toBe(60);
    expect(p.metrics.opMargin.value).toBe(30);
    expect(p.metrics.netMargin.value).toBe(20);
    expect(p.metrics.fcfMargin.value).toBe(20);
  });
  it("margins are DERIVED", () => {
    expect(p.metrics.grossMargin.reliability).toBe("DERIVED");
  });
});

describe("computePacket — fcf / returns", () => {
  const p = computePacket(baseInput);
  it("derives FCF from OCF - capex", () => {
    expect(p.metrics.fcf.value).toBe(200);
    expect(p.metrics.fcf.reliability).toBe("DERIVED");
  });
  it("ROIC uses derived tax rate", () => {
    // NOPAT = 300 * (1 - 0.2) = 240; invested = 400+500-100 = 800; 240/800 = 30%
    expect(p.metrics.roic.value).toBe(30);
    expect(p.metrics.roic.reliability).toBe("DERIVED");
  });
  it("ROE", () => {
    expect(p.metrics.roe.value).toBe(40); // 200/500
  });
});

describe("computePacket — balance sheet", () => {
  const p = computePacket(baseInput);
  it("net debt and leverage", () => {
    expect(p.metrics.netDebt.value).toBe(300); // 400 - 100
    expect(p.metrics.netDebtToEbitda.value).toBeCloseTo(0.86, 2); // 300/350
  });
  it("share count change over 3y (buyback => negative)", () => {
    // 110 -> 100 = -9.09%
    expect(p.metrics.shareCountChange3y.value).toBeCloseTo(-9.09, 1);
  });
});

describe("computePacket — growth", () => {
  const p = computePacket(baseInput);
  it("CAGR 3y and 5y and YoY", () => {
    expect(p.metrics.revenueCagr3y.value).toBeCloseTo(25.99, 1); // 500->1000
    expect(p.metrics.revenueCagr5y.value).toBeCloseTo(20.11, 1); // 400->1000
    expect(p.metrics.revenueYoY.value).toBeCloseTo(11.11, 1); // 900->1000
  });
});

describe("computePacket — valuation", () => {
  const p = computePacket(baseInput);
  it("derives EV when not supplied", () => {
    // marketCap + debt - cash = 5000 + 400 - 100 = 5300
    expect(p.quote.enterpriseValue.value).toBe(5300);
    expect(p.quote.enterpriseValue.reliability).toBe("DERIVED");
  });
  it("multiples", () => {
    expect(p.valuation.pe.value).toBe(25); // 5000/200
    expect(p.valuation.evEbitda.value).toBeCloseTo(15.14, 1); // 5300/350
    expect(p.valuation.evSales.value).toBe(5.3); // 5300/1000
    expect(p.valuation.pFcf.value).toBe(25); // 5000/200
  });
  it("historical P/E range + percentile", () => {
    const r = p.multipleHistory.pe;
    expect(r.min).toBe(20);
    expect(r.max).toBe(30);
    expect(r.median).toBe(25);
    expect(r.current).toBe(25);
    // values <= 25 are {20,25} of {20,25,30} = 2/3 = ~67
    expect(r.percentile).toBe(67);
  });
});

describe("computePacket — completeness", () => {
  it("rich data => HIGH", () => {
    const p = computePacket(baseInput);
    expect(p.completeness.level).toBe("HIGH");
    expect(p.completeness.missing).toEqual([]);
  });
  it("sparse data => LOW with missing list", () => {
    const p = computePacket({
      profile: { ticker: "X", name: "X" },
      financials: { ticker: "X", periods: [fy("2023-12-31", { revenue: 100 })] },
    });
    expect(p.completeness.level).toBe("LOW");
    expect(p.completeness.missing).toContain("pe");
  });
});

describe("computePacket — staleness", () => {
  it("flags an old quote as STALE and warns", () => {
    const p = computePacket({
      ...baseInput,
      now: new Date("2024-02-01T00:00:00.000Z"), // 31 days after quote
    });
    expect(p.quote.price.reliability).toBe("STALE");
    expect(p.warnings.some((w) => w.includes("days old"))).toBe(true);
  });
});

describe("computePacket — proxy tax when pretax/tax missing", () => {
  it("marks ROIC as PROXY", () => {
    const periods = financials.periods.map((p, i) =>
      i === 0 ? { ...p, pretaxIncome: undefined, incomeTax: undefined } : p,
    );
    const p = computePacket({
      ...baseInput,
      financials: { ticker: "TEST", periods },
    });
    // NOPAT = 300 * (1 - 0.21) = 237; 237/800 = 29.625 -> 29.63
    expect(p.metrics.roic.value).toBeCloseTo(29.63, 1);
    expect(p.metrics.roic.reliability).toBe("PROXY");
  });
});
