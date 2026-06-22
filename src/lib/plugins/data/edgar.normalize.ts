// Pure normalization for SEC EDGAR responses (company_tickers, submissions,
// and XBRL companyfacts). No I/O — unit-testable against fixtures.
//
// EDGAR fundamentals come from XBRL "companyfacts". We extract annual (10-K)
// values for a curated set of us-gaap concepts and merge them by fiscal-year
// end date. EDGAR has no market data, so quotes/ratios/peers are unsupported.

import type {
  NormalizedFiling,
  NormalizedFinancials,
  NormalizedPeriod,
  NormalizedProfile,
  SearchResult,
} from "../types";

// ---- Raw shapes (subset) ----
export interface EdgarTickerMap {
  [idx: string]: { cik_str: number; ticker: string; title: string };
}
export interface EdgarSubmissions {
  cik: string;
  name: string;
  sicDescription?: string;
  tickers?: string[];
  exchanges?: string[];
  addresses?: { business?: { stateOrCountry?: string } };
  filings?: {
    recent?: {
      form: string[];
      filingDate: string[];
      primaryDocument: string[];
      accessionNumber: string[];
      primaryDocDescription?: string[];
    };
  };
}
interface FactEntry {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}
export interface EdgarCompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, { units: Record<string, FactEntry[]> }>;
    dei?: Record<string, { units: Record<string, FactEntry[]> }>;
  };
}

export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

export function normalizeTickerMap(
  raw: EdgarTickerMap,
): Map<string, { cik: string; title: string }> {
  const out = new Map<string, { cik: string; title: string }>();
  for (const v of Object.values(raw)) {
    if (!v?.ticker) continue;
    out.set(v.ticker.toUpperCase(), {
      cik: padCik(v.cik_str),
      title: v.title,
    });
  }
  return out;
}

export function searchTickerMap(
  raw: EdgarTickerMap,
  query: string,
  limit = 10,
): SearchResult[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const results: SearchResult[] = [];
  for (const v of Object.values(raw)) {
    if (!v?.ticker) continue;
    const t = v.ticker.toUpperCase();
    const name = (v.title ?? "").toUpperCase();
    if (t === q || t.startsWith(q) || name.includes(q)) {
      results.push({ ticker: v.ticker, name: v.title });
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function normalizeSubmissionsProfile(
  ticker: string,
  s: EdgarSubmissions,
): NormalizedProfile {
  return {
    ticker,
    name: s.name,
    exchange: s.exchanges?.[0],
    industry: s.sicDescription,
    country: s.addresses?.business?.stateOrCountry,
    cik: padCik(s.cik),
  };
}

export function normalizeFilings(
  s: EdgarSubmissions,
  limit = 20,
): NormalizedFiling[] {
  const r = s.filings?.recent;
  if (!r) return [];
  const cik = padCik(s.cik);
  const out: NormalizedFiling[] = [];
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    const form = r.form[i];
    if (!/^(10-K|10-Q|8-K|20-F|40-F|DEF 14A)/.test(form)) continue;
    const accession = r.accessionNumber[i]?.replace(/-/g, "");
    const doc = r.primaryDocument[i];
    out.push({
      type: form,
      filedAt: r.filingDate[i],
      title: r.primaryDocDescription?.[i] ?? form,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${doc}`,
    });
  }
  return out;
}

// ---- Fundamentals extraction ----

// For a single concept, return a map of fiscal-year-end -> value using only
// 10-K filings. Duration concepts (income/cash-flow) are filtered to ~annual
// spans; instant concepts (balance sheet) are taken as-is at year end. On
// duplicate period ends, the most recently filed value wins.
function annualByEnd(
  entries: FactEntry[] | undefined,
  isDuration: boolean,
): Map<string, number> {
  const map = new Map<string, { val: number; filed: string }>();
  for (const e of entries ?? []) {
    if (e.form !== "10-K") continue;
    if (isDuration) {
      if (!e.start) continue;
      const days =
        (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86_400_000;
      if (days < 350 || days > 380) continue; // keep ~annual only
    }
    const prev = map.get(e.end);
    if (!prev || new Date(e.filed) > new Date(prev.filed)) {
      map.set(e.end, { val: e.val, filed: e.filed });
    }
  }
  return new Map([...map].map(([k, v]) => [k, v.val]));
}

// Try candidate concepts in priority order, merging their annual maps.
function pick(
  facts: EdgarCompanyFacts["facts"]["us-gaap"],
  concepts: string[],
  unit: string,
  isDuration: boolean,
): Map<string, number> {
  const merged = new Map<string, number>();
  for (const c of concepts) {
    const units = facts?.[c]?.units?.[unit];
    if (!units) continue;
    for (const [end, val] of annualByEnd(units, isDuration)) {
      if (!merged.has(end)) merged.set(end, val);
    }
  }
  return merged;
}

const CONCEPTS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ],
  grossProfit: ["GrossProfit"],
  opIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  ocf: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
  ],
  totalDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  equity: ["StockholdersEquity"],
};

export function normalizeCompanyFacts(
  ticker: string,
  cf: EdgarCompanyFacts,
): NormalizedFinancials {
  const f = cf.facts["us-gaap"];
  const revenue = pick(f, CONCEPTS.revenue, "USD", true);
  const grossProfit = pick(f, CONCEPTS.grossProfit, "USD", true);
  const opIncome = pick(f, CONCEPTS.opIncome, "USD", true);
  const netIncome = pick(f, CONCEPTS.netIncome, "USD", true);
  const pretax = pick(f, CONCEPTS.pretaxIncome, "USD", true);
  const tax = pick(f, CONCEPTS.incomeTax, "USD", true);
  const ocf = pick(f, CONCEPTS.ocf, "USD", true);
  const capex = pick(f, CONCEPTS.capex, "USD", true);
  const debt = pick(f, CONCEPTS.totalDebt, "USD", false);
  const cash = pick(f, CONCEPTS.cash, "USD", false);
  const equity = pick(f, CONCEPTS.equity, "USD", false);
  const shares = pick(
    f,
    ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "shares",
    true,
  );

  // Period ends are defined by the revenue series (fall back to net income).
  const ends = [...(revenue.size ? revenue.keys() : netIncome.keys())].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  const periods: NormalizedPeriod[] = ends.map((end) => ({
    periodType: "FY",
    fiscalDate: end,
    revenue: revenue.get(end),
    grossProfit: grossProfit.get(end),
    opIncome: opIncome.get(end),
    netIncome: netIncome.get(end),
    pretaxIncome: pretax.get(end),
    incomeTax: tax.get(end),
    ocf: ocf.get(end),
    capex: capex.get(end),
    totalDebt: debt.get(end),
    cash: cash.get(end),
    totalEquity: equity.get(end),
    shares: shares.get(end),
  }));

  return { ticker, periods };
}
