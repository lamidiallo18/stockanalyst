// Pure normalization functions mapping Financial Modeling Prep's raw API shapes
// into the app's canonical types. Kept free of I/O so they can be unit-tested
// against recorded fixtures with no network.

import type {
  NormalizedFinancials,
  NormalizedHistoricalRatio,
  NormalizedNewsItem,
  NormalizedPeer,
  NormalizedPeriod,
  NormalizedProfile,
  NormalizedQuote,
  SearchResult,
} from "../types";

// ---- Raw FMP shapes (only the fields we read) ----
export interface FmpProfile {
  symbol: string;
  companyName?: string;
  exchangeShortName?: string;
  sector?: string;
  industry?: string;
  country?: string;
  description?: string;
  cik?: string;
}
export interface FmpQuote {
  symbol: string;
  price?: number;
  marketCap?: number;
}
export interface FmpIncome {
  date: string;
  period?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  ebitda?: number;
  netIncome?: number;
  incomeBeforeTax?: number;
  incomeTaxExpense?: number;
  weightedAverageShsOutDil?: number;
}
export interface FmpBalance {
  date: string;
  totalDebt?: number;
  cashAndCashEquivalents?: number;
  cashAndShortTermInvestments?: number;
  totalStockholdersEquity?: number;
}
export interface FmpCashflow {
  date: string;
  operatingCashFlow?: number;
  netCashProvidedByOperatingActivities?: number;
  capitalExpenditure?: number;
  freeCashFlow?: number;
}
export interface FmpRatio {
  date: string;
  priceEarningsRatio?: number;
  enterpriseValueMultiple?: number; // EV/EBITDA
  priceToSalesRatio?: number;
  priceToFreeCashFlowsRatio?: number;
}
export interface FmpPeers {
  symbol: string;
  peersList?: string[];
}
export interface FmpNews {
  title: string;
  url: string;
  site?: string;
  publishedDate?: string;
  text?: string;
}
export interface FmpSearch {
  symbol: string;
  name?: string;
  exchangeShortName?: string;
}

function num(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

export function normalizeProfile(raw: FmpProfile[]): NormalizedProfile | null {
  const p = raw?.[0];
  if (!p) return null;
  return {
    ticker: p.symbol,
    name: p.companyName ?? p.symbol,
    exchange: p.exchangeShortName,
    sector: p.sector,
    industry: p.industry,
    country: p.country,
    description: p.description,
    cik: p.cik,
  };
}

export function normalizeQuote(
  raw: FmpQuote[],
  asOf: string,
): NormalizedQuote | null {
  const q = raw?.[0];
  if (!q) return null;
  return {
    ticker: q.symbol,
    asOf,
    price: num(q.price),
    marketCap: num(q.marketCap),
  };
}

// Merge income / balance / cash-flow statements (each most-recent-first) by
// fiscal date into unified periods.
export function normalizeFinancials(
  ticker: string,
  income: FmpIncome[],
  balance: FmpBalance[],
  cashflow: FmpCashflow[],
): NormalizedFinancials {
  const balByDate = new Map(balance.map((b) => [b.date, b]));
  const cfByDate = new Map(cashflow.map((c) => [c.date, c]));

  const periods: NormalizedPeriod[] = income.map((inc) => {
    const b = balByDate.get(inc.date);
    const c = cfByDate.get(inc.date);
    return {
      periodType: inc.period && inc.period !== "FY" ? "Q" : "FY",
      fiscalDate: inc.date,
      revenue: num(inc.revenue),
      grossProfit: num(inc.grossProfit),
      opIncome: num(inc.operatingIncome),
      ebitda: num(inc.ebitda),
      netIncome: num(inc.netIncome),
      pretaxIncome: num(inc.incomeBeforeTax),
      incomeTax: num(inc.incomeTaxExpense),
      ocf: num(c?.operatingCashFlow ?? c?.netCashProvidedByOperatingActivities),
      capex: num(c?.capitalExpenditure),
      fcf: num(c?.freeCashFlow),
      totalDebt: num(b?.totalDebt),
      cash: num(b?.cashAndCashEquivalents ?? b?.cashAndShortTermInvestments),
      totalEquity: num(b?.totalStockholdersEquity),
      shares: num(inc.weightedAverageShsOutDil),
    };
  });

  return { ticker, periods };
}

export function normalizeRatios(
  raw: FmpRatio[],
): NormalizedHistoricalRatio[] {
  return (raw ?? []).map((r) => ({
    fiscalDate: r.date,
    pe: num(r.priceEarningsRatio),
    evEbitda: num(r.enterpriseValueMultiple),
    evSales: num(r.priceToSalesRatio),
    pFcf: num(r.priceToFreeCashFlowsRatio),
  }));
}

export function normalizePeers(raw: FmpPeers[]): NormalizedPeer[] {
  const list = raw?.[0]?.peersList ?? [];
  return list.map((t) => ({ ticker: t }));
}

export function normalizeNews(raw: FmpNews[]): NormalizedNewsItem[] {
  return (raw ?? []).map((n) => ({
    title: n.title,
    url: n.url,
    source: n.site,
    publishedAt: n.publishedDate,
    summary: n.text,
  }));
}

export function normalizeSearch(raw: FmpSearch[]): SearchResult[] {
  return (raw ?? []).map((s) => ({
    ticker: s.symbol,
    name: s.name ?? s.symbol,
    exchange: s.exchangeShortName,
  }));
}
