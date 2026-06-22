import { describe, it, expect } from "vitest";
import {
  padCik,
  normalizeTickerMap,
  searchTickerMap,
  normalizeFilings,
  normalizeCompanyFacts,
  type EdgarCompanyFacts,
  type EdgarSubmissions,
  type EdgarTickerMap,
} from "./edgar.normalize";

const tickerMap: EdgarTickerMap = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
};

describe("padCik", () => {
  it("zero-pads to 10 digits", () => expect(padCik(320193)).toBe("0000320193"));
  it("strips non-digits", () => expect(padCik("CIK0000320193")).toBe("0000320193"));
});

describe("ticker map", () => {
  it("normalizes to uppercase keyed map with padded CIK", () => {
    const m = normalizeTickerMap(tickerMap);
    expect(m.get("AAPL")?.cik).toBe("0000320193");
  });
  it("search matches ticker prefix and name", () => {
    expect(searchTickerMap(tickerMap, "msft")[0].ticker).toBe("MSFT");
    expect(searchTickerMap(tickerMap, "apple")[0].ticker).toBe("AAPL");
  });
});

describe("normalizeFilings", () => {
  it("keeps relevant forms and builds archive URLs", () => {
    const s: EdgarSubmissions = {
      cik: "320193",
      name: "Apple Inc.",
      filings: {
        recent: {
          form: ["10-K", "4", "8-K"],
          filingDate: ["2023-11-03", "2023-10-01", "2023-08-04"],
          primaryDocument: ["aapl-20230930.htm", "x.xml", "aapl-8k.htm"],
          accessionNumber: ["0000320193-23-000106", "000-0", "0000320193-23-000077"],
        },
      },
    };
    const f = normalizeFilings(s);
    // form "4" filtered out; 10-K and 8-K kept
    expect(f.map((x) => x.type)).toEqual(["10-K", "8-K"]);
    expect(f[0].url).toContain("/Archives/edgar/data/320193/000032019323000106/");
  });
});

describe("normalizeCompanyFacts", () => {
  const facts: EdgarCompanyFacts = {
    cik: 320193,
    entityName: "Apple Inc.",
    facts: {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              // annual 10-K (≈365d) — kept
              { start: "2022-10-01", end: "2023-09-30", val: 383285000000, form: "10-K", filed: "2023-11-03" },
              { start: "2021-10-01", end: "2022-09-30", val: 394328000000, form: "10-K", filed: "2022-10-28" },
              // a quarterly 10-Q span — must be excluded
              { start: "2023-07-01", end: "2023-09-30", val: 89498000000, form: "10-Q", filed: "2023-11-03" },
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              { start: "2022-10-01", end: "2023-09-30", val: 96995000000, form: "10-K", filed: "2023-11-03" },
            ],
          },
        },
        StockholdersEquity: {
          units: {
            USD: [
              // instant (balance sheet) — no start
              { end: "2023-09-30", val: 62146000000, form: "10-K", filed: "2023-11-03" },
            ],
          },
        },
      },
    },
  };

  it("extracts annual periods, excluding quarterly spans", () => {
    const f = normalizeCompanyFacts("AAPL", facts);
    expect(f.periods).toHaveLength(2);
    const latest = f.periods[0];
    expect(latest.fiscalDate).toBe("2023-09-30");
    expect(latest.revenue).toBe(383285000000);
    expect(latest.netIncome).toBe(96995000000);
    expect(latest.totalEquity).toBe(62146000000);
  });

  it("sorts periods most-recent-first", () => {
    const f = normalizeCompanyFacts("AAPL", facts);
    expect(f.periods[0].fiscalDate > f.periods[1].fiscalDate).toBe(true);
  });
});
