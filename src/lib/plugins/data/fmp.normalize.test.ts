import { describe, it, expect } from "vitest";
import {
  normalizeProfile,
  normalizeQuote,
  normalizeFinancials,
  normalizeRatios,
  normalizePeers,
  normalizeSearch,
} from "./fmp.normalize";

describe("fmp normalizeProfile", () => {
  it("maps the first profile entry", () => {
    const p = normalizeProfile([
      {
        symbol: "AAPL",
        companyName: "Apple Inc.",
        exchangeShortName: "NASDAQ",
        sector: "Technology",
        industry: "Consumer Electronics",
        country: "US",
        cik: "0000320193",
      },
    ]);
    expect(p?.ticker).toBe("AAPL");
    expect(p?.name).toBe("Apple Inc.");
    expect(p?.cik).toBe("0000320193");
  });
  it("returns null on empty", () => expect(normalizeProfile([])).toBeNull());
});

describe("fmp normalizeQuote", () => {
  it("maps price + market cap with asOf", () => {
    const q = normalizeQuote([{ symbol: "AAPL", price: 190, marketCap: 3e12 }], "2024-01-01");
    expect(q?.price).toBe(190);
    expect(q?.marketCap).toBe(3e12);
    expect(q?.asOf).toBe("2024-01-01");
  });
});

describe("fmp normalizeFinancials", () => {
  it("merges income/balance/cashflow by date", () => {
    const f = normalizeFinancials(
      "AAPL",
      [
        {
          date: "2023-09-30",
          period: "FY",
          revenue: 383285,
          grossProfit: 169148,
          operatingIncome: 114301,
          netIncome: 96995,
          incomeBeforeTax: 113736,
          incomeTaxExpense: 16741,
          weightedAverageShsOutDil: 15812,
        },
        { date: "2022-09-30", period: "FY", revenue: 394328 },
      ],
      [
        {
          date: "2023-09-30",
          totalDebt: 111088,
          cashAndCashEquivalents: 29965,
          totalStockholdersEquity: 62146,
        },
      ],
      [
        {
          date: "2023-09-30",
          operatingCashFlow: 110543,
          capitalExpenditure: -10959,
          freeCashFlow: 99584,
        },
      ],
    );
    expect(f.periods).toHaveLength(2);
    const latest = f.periods[0];
    expect(latest.revenue).toBe(383285);
    expect(latest.totalDebt).toBe(111088);
    expect(latest.fcf).toBe(99584);
    expect(latest.totalEquity).toBe(62146);
    expect(latest.periodType).toBe("FY");
    // Period without matching balance/cf still maps income fields
    expect(f.periods[1].revenue).toBe(394328);
    expect(f.periods[1].totalDebt).toBeUndefined();
  });

  it("tags quarterly periods", () => {
    const f = normalizeFinancials(
      "X",
      [{ date: "2023-06-30", period: "Q2", revenue: 100 }],
      [],
      [],
    );
    expect(f.periods[0].periodType).toBe("Q");
  });
});

describe("fmp normalizeRatios", () => {
  it("maps multiples per period", () => {
    const r = normalizeRatios([
      {
        date: "2023-09-30",
        priceEarningsRatio: 30,
        enterpriseValueMultiple: 22,
        priceToSalesRatio: 7,
        priceToFreeCashFlowsRatio: 28,
      },
    ]);
    expect(r[0]).toEqual({
      fiscalDate: "2023-09-30",
      pe: 30,
      evEbitda: 22,
      evSales: 7,
      pFcf: 28,
    });
  });
});

describe("fmp normalizePeers / search", () => {
  it("extracts peer list", () => {
    const peers = normalizePeers([{ symbol: "AAPL", peersList: ["MSFT", "GOOGL"] }]);
    expect(peers.map((p) => p.ticker)).toEqual(["MSFT", "GOOGL"]);
  });
  it("maps search results", () => {
    const s = normalizeSearch([
      { symbol: "AAPL", name: "Apple Inc.", exchangeShortName: "NASDAQ" },
    ]);
    expect(s[0]).toEqual({ ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" });
  });
});
