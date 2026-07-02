// Test obligations from docs/normalization-policy.md §5 (EDGAR side).
import { describe, it, expect } from "vitest";
import {
  padCik,
  normalizeTickerMap,
  searchTickerMap,
  normalizeCompanyFacts,
  type EdgarCompanyFacts,
  type EdgarTickerMap,
} from "./edgar.normalize";

const tickerMap: EdgarTickerMap = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
};

describe("padCik / ticker map", () => {
  it("zero-pads to 10 digits", () => expect(padCik(320193)).toBe("0000320193"));
  it("normalizes to uppercase keyed map", () => {
    const m = normalizeTickerMap(tickerMap);
    expect(m.get("AAPL")?.cik).toBe("0000320193");
  });
  it("search matches ticker prefix and name", () => {
    expect(searchTickerMap(tickerMap, "msft")[0].ticker).toBe("MSFT");
    expect(searchTickerMap(tickerMap, "apple")[0].ticker).toBe("AAPL");
  });
});

describe("normalizeCompanyFacts — annual duration window (non-calendar FYE)", () => {
  const facts: EdgarCompanyFacts = {
    cik: 320193,
    entityName: "Apple Inc.",
    facts: {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              // Sept FYE annual (≈364d) — kept (non-calendar fiscal year)
              { start: "2022-10-01", end: "2023-09-30", val: 383e9, form: "10-K", filed: "2023-11-03" },
              { start: "2021-10-01", end: "2022-09-30", val: 394e9, form: "10-K", filed: "2022-10-28" },
              // Quarterly span in a 10-K — excluded by the window
              { start: "2023-07-01", end: "2023-09-30", val: 89e9, form: "10-K", filed: "2023-11-03" },
              // 10-Q — excluded by form
              { start: "2023-01-01", end: "2023-03-31", val: 90e9, form: "10-Q", filed: "2023-05-01" },
            ],
          },
        },
        StockholdersEquity: {
          units: {
            USD: [
              // instant fact (no start) — kept as-is at period end
              { end: "2023-09-30", val: 62e9, form: "10-K", filed: "2023-11-03" },
            ],
          },
        },
      },
    },
  };

  it("keeps annual periods, excludes quarterly spans and 10-Qs", () => {
    const f = normalizeCompanyFacts("AAPL", facts);
    expect(f.periods).toHaveLength(2);
    expect(f.periods[0].fiscalDate).toBe("2023-09-30");
    expect(f.periods[0].revenue).toBe(383e9);
    expect(f.periods[0].totalEquity).toBe(62e9);
  });
});

describe("normalizeCompanyFacts — restatements (latest-filed wins)", () => {
  const facts: EdgarCompanyFacts = {
    cik: 1,
    entityName: "Restated Co",
    facts: {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              // Original filing
              { start: "2022-01-01", end: "2022-12-31", val: 500, form: "10-K", filed: "2023-02-01" },
              // Restated in the next year's 10-K — must win
              { start: "2022-01-01", end: "2022-12-31", val: 480, form: "10-K", filed: "2024-02-01" },
            ],
          },
        },
      },
    },
  };

  it("uses the most recently filed value for a duplicated period", () => {
    const f = normalizeCompanyFacts("X", facts);
    expect(f.periods).toHaveLength(1);
    expect(f.periods[0].revenue).toBe(480);
  });
});

describe("normalizeCompanyFacts — concept candidates", () => {
  it("falls back to later candidates only for missing periods", () => {
    const facts: EdgarCompanyFacts = {
      cik: 2,
      entityName: "Fallback Co",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                { start: "2023-01-01", end: "2023-12-31", val: 100, form: "10-K", filed: "2024-02-01" },
              ],
            },
          },
          Revenues: {
            units: {
              USD: [
                // Same period under the fallback concept with a different value
                { start: "2023-01-01", end: "2023-12-31", val: 999, form: "10-K", filed: "2024-02-01" },
                // Older period only present under the fallback — fills
                { start: "2022-01-01", end: "2022-12-31", val: 90, form: "10-K", filed: "2023-02-01" },
              ],
            },
          },
        },
      },
    };
    const f = normalizeCompanyFacts("X", facts);
    expect(f.periods[0].revenue).toBe(100); // first candidate wins
    expect(f.periods[1].revenue).toBe(90); // fallback fills the gap
  });
});
