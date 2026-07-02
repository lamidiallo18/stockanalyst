// Shared synthetic fixtures for unit tests. Clean round numbers so expected
// outputs are exact. Not imported by production code.
import { computePacket, type CalcInput } from "@/lib/calc/engine";
import type {
  NormalizedFinancials,
  NormalizedPeriod,
  NormalizedPricePoint,
} from "@/lib/plugins/types";

export function fy(
  date: string,
  over: Partial<NormalizedPeriod>,
): NormalizedPeriod {
  return { periodType: "FY", fiscalDate: date, ...over };
}

export const FIXTURE_FINANCIALS: NormalizedFinancials = {
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
      capex: 80, // fcf = 200
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

// ~120 daily closes alternating ±1% -> a real vol estimate.
export function fixturePriceHistory(): NormalizedPricePoint[] {
  const pts: NormalizedPricePoint[] = [];
  let close = 100;
  for (let i = 0; i < 120; i++) {
    close *= i % 2 === 0 ? 1.01 : 0.99;
    pts.push({ date: `2023-${String(1 + (i % 12)).padStart(2, "0")}-01`, close });
  }
  return pts;
}

export function fixtureInput(over: Partial<CalcInput> = {}): CalcInput {
  return {
    profile: { ticker: "TEST", name: "Test Corp", sector: "Tech" },
    quote: {
      ticker: "TEST",
      asOf: "2024-01-01T00:00:00.000Z",
      price: 50,
      marketCap: 5000,
    },
    financials: FIXTURE_FINANCIALS,
    historicalRatios: [
      { fiscalDate: "2021-12-31", pe: 20 },
      { fiscalDate: "2022-12-31", pe: 30 },
      { fiscalDate: "2023-12-31", pe: 25 },
    ],
    priceHistory: fixturePriceHistory(),
    discountRatePct: 10,
    now: new Date("2024-01-02T00:00:00.000Z"),
    ...over,
  };
}

export function fixturePacket(over: Partial<CalcInput> = {}) {
  return computePacket(fixtureInput(over));
}
