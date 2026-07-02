import { describe, it, expect } from "vitest";
import {
  normalizeProfile,
  normalizeQuote,
  normalizeFinancials,
  normalizeRatios,
  normalizePriceHistory,
  normalizePeers,
  normalizeSearch,
} from "./fmp.normalize";

describe("fmp normalizeProfile / normalizeQuote", () => {
  it("maps the first profile entry", () => {
    const p = normalizeProfile([
      {
        symbol: "AAPL",
        companyName: "Apple Inc.",
        exchangeShortName: "NASDAQ",
        sector: "Technology",
        cik: "0000320193",
      },
    ]);
    expect(p?.ticker).toBe("AAPL");
    expect(p?.name).toBe("Apple Inc.");
  });
  it("returns null on empty", () => expect(normalizeProfile([])).toBeNull());
  it("maps quote with asOf", () => {
    const q = normalizeQuote([{ symbol: "AAPL", price: 190, marketCap: 3e12 }], "2024-01-01");
    expect(q?.price).toBe(190);
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
    expect(latest.periodType).toBe("FY");
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

describe("fmp normalizeRatios / peers / search", () => {
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

describe("fmp normalizePriceHistory", () => {
  it("filters invalid rows and sorts most-recent-first", () => {
    const pts = normalizePriceHistory({
      symbol: "AAPL",
      historical: [
        { date: "2024-01-02", close: 185 },
        { date: "2024-01-04", close: 182 },
        { date: "2024-01-03", close: 0 }, // invalid
        { date: "2024-01-05" }, // missing close
      ],
    });
    expect(pts.map((p) => p.date)).toEqual(["2024-01-04", "2024-01-02"]);
  });
  it("empty input -> empty output", () => {
    expect(normalizePriceHistory({} as never)).toEqual([]);
  });
});
