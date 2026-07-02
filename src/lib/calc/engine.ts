// ===========================================================================
// Calc Engine — deterministic, pure financial computation.
//
// Takes normalized (already reconciled) provider data and produces a
// FinancialPacket. Contains NO I/O and NO randomness, so it is fully
// unit-testable and reproducible. Every output value is tagged with a
// ReliabilityFlag (REPORTED / DERIVED / PROXY / STALE / MISSING).
// ===========================================================================

import { ReliabilityFlag } from "@/lib/enums";
import type {
  NormalizedFinancials,
  NormalizedHistoricalRatio,
  NormalizedPeer,
  NormalizedPeriod,
  NormalizedPricePoint,
  NormalizedProfile,
  NormalizedQuote,
} from "@/lib/plugins/types";
import type { Discrepancy } from "@/lib/data/reconcile";
import type {
  DataCompleteness,
  FinancialPacket,
  MetricValue,
  MultipleRange,
  PacketPeer,
  PacketPeriod,
  PacketReverseDcf,
  SourceProvenance,
} from "./types";
import {
  annualizedVolPct,
  cagrPct,
  growthPct,
  isNum,
  marginPct,
  max,
  median,
  min,
  percentileRank,
  round,
  safeDiv,
} from "./math";
import { solveImpliedGrowth } from "./reverse-dcf";

const { REPORTED, DERIVED, PROXY, MISSING, STALE } = ReliabilityFlag;

// Default effective tax rate when we can't derive one from reported pretax/tax.
const ASSUMED_TAX_RATE = 0.21;
const DEFAULT_FRESHNESS_DAYS = 5;

export interface CalcPeerInput {
  peer: NormalizedPeer;
  quote?: NormalizedQuote;
  financials?: NormalizedFinancials;
}

export interface CalcInput {
  profile: NormalizedProfile;
  quote?: NormalizedQuote;
  financials: NormalizedFinancials; // annual, post-reconciliation
  historicalRatios?: NormalizedHistoricalRatio[];
  priceHistory?: NormalizedPricePoint[];
  peers?: CalcPeerInput[];
  sources?: SourceProvenance[];
  discrepancies?: Discrepancy[];
  /** reverse-DCF discount rate from Settings (default 10) */
  discountRatePct?: number;
  /** quotes older than this many days are flagged STALE */
  freshnessDays?: number;
  /** "now" override for deterministic tests */
  now?: Date;
}

function mv(
  value: number | null,
  reliability: ReliabilityFlag,
  opts: { unit?: string; note?: string } = {},
): MetricValue {
  return {
    value: value === null ? null : round(value),
    reliability: value === null ? MISSING : reliability,
    ...opts,
  };
}

function missing(unit?: string, note?: string): MetricValue {
  return { value: null, reliability: MISSING, unit, note };
}

/** Sort periods most-recent-first; ignore entries without a fiscalDate. */
function sortPeriods(periods: NormalizedPeriod[]): NormalizedPeriod[] {
  return periods
    .filter((p) => p.fiscalDate)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.fiscalDate).getTime() - new Date(a.fiscalDate).getTime(),
    );
}

/** Enterprise value: prefer reported; else marketCap + debt - cash (derived). */
function enterpriseValue(
  quote: NormalizedQuote | undefined,
  latest: NormalizedPeriod | undefined,
): { value: number | null; reliability: ReliabilityFlag } {
  if (quote && isNum(quote.enterpriseValue))
    return { value: quote.enterpriseValue, reliability: REPORTED };
  if (
    quote &&
    isNum(quote.marketCap) &&
    latest &&
    (isNum(latest.totalDebt) || isNum(latest.cash))
  ) {
    const ev = quote.marketCap + (latest.totalDebt ?? 0) - (latest.cash ?? 0);
    return { value: ev, reliability: DERIVED };
  }
  return { value: null, reliability: MISSING };
}

function periodFcf(p: NormalizedPeriod): {
  value: number | null;
  reliability: ReliabilityFlag;
} {
  if (isNum(p.fcf)) return { value: p.fcf, reliability: REPORTED };
  if (isNum(p.ocf) && isNum(p.capex)) {
    // capex is reported as a negative number by some providers; normalize to
    // "cash spent" magnitude subtracted from operating cash flow.
    const capexMag = Math.abs(p.capex);
    return { value: p.ocf - capexMag, reliability: DERIVED };
  }
  return { value: null, reliability: MISSING };
}

function buildPeriodView(p: NormalizedPeriod): PacketPeriod {
  const fcf = periodFcf(p);
  return {
    fiscalDate: p.fiscalDate,
    periodType: p.periodType,
    revenue: mv(p.revenue ?? null, REPORTED, { unit: "$" }),
    grossMargin: mv(marginPct(p.grossProfit, p.revenue), DERIVED, { unit: "%" }),
    opMargin: mv(marginPct(p.opIncome, p.revenue), DERIVED, { unit: "%" }),
    ebitdaMargin: mv(marginPct(p.ebitda, p.revenue), DERIVED, { unit: "%" }),
    netMargin: mv(marginPct(p.netIncome, p.revenue), DERIVED, { unit: "%" }),
    fcfMargin: mv(marginPct(fcf.value, p.revenue), DERIVED, { unit: "%" }),
    fcf: mv(fcf.value, fcf.reliability, { unit: "$" }),
  };
}

function rangeFrom(values: number[], current: number | null): MultipleRange {
  const hist = values.filter(isNum);
  if (hist.length === 0) {
    return {
      min: null,
      median: null,
      max: null,
      current: round(current),
      percentile: null,
      reliability: MISSING,
    };
  }
  return {
    min: round(min(hist)),
    median: round(median(hist)),
    max: round(max(hist)),
    current: round(current),
    percentile: round(percentileRank(current, hist), 0),
    reliability: REPORTED,
  };
}

function computeRoic(latest: NormalizedPeriod | undefined): MetricValue {
  if (!latest || !isNum(latest.opIncome))
    return missing("%", "Operating income unavailable.");
  const invested =
    (latest.totalDebt ?? null) !== null && (latest.totalEquity ?? null) !== null
      ? (latest.totalDebt ?? 0) + (latest.totalEquity ?? 0) - (latest.cash ?? 0)
      : null;
  if (invested === null || invested === 0)
    return missing("%", "Invested capital (debt + equity − cash) unavailable.");
  let effTax = ASSUMED_TAX_RATE;
  let taxIsDerived = false;
  if (
    isNum(latest.pretaxIncome) &&
    latest.pretaxIncome > 0 &&
    isNum(latest.incomeTax)
  ) {
    effTax = Math.min(Math.max(latest.incomeTax / latest.pretaxIncome, 0), 0.6);
    taxIsDerived = true;
  }
  const nopat = latest.opIncome * (1 - effTax);
  const value = (nopat / invested) * 100;
  return mv(value, taxIsDerived ? DERIVED : PROXY, {
    unit: "%",
    note: taxIsDerived
      ? "NOPAT / (debt + equity − cash), effective tax derived."
      : `NOPAT / (debt + equity − cash), assumed ${ASSUMED_TAX_RATE * 100}% tax.`,
  });
}

function computePeer(input: CalcPeerInput): PacketPeer {
  const periods = sortPeriods(input.financials?.periods ?? []);
  const latest = periods[0];
  const oldest3 = periods[3];
  const ev = enterpriseValue(input.quote, latest);
  const mc = input.quote?.marketCap ?? null;

  return {
    ticker: input.peer.ticker,
    name: input.peer.name,
    pe: mv(safeDiv(mc, latest?.netIncome), DERIVED, { unit: "x" }),
    evEbitda: mv(safeDiv(ev.value, latest?.ebitda), DERIVED, { unit: "x" }),
    evSales: mv(safeDiv(ev.value, latest?.revenue), DERIVED, { unit: "x" }),
    grossMargin: mv(marginPct(latest?.grossProfit, latest?.revenue), DERIVED, {
      unit: "%",
    }),
    opMargin: mv(marginPct(latest?.opIncome, latest?.revenue), DERIVED, {
      unit: "%",
    }),
    roic: computeRoic(latest),
    revenueCagr3y: mv(cagrPct(oldest3?.revenue, latest?.revenue, 3), DERIVED, {
      unit: "%",
    }),
  };
}

export function computePacket(input: CalcInput): FinancialPacket {
  const now = input.now ?? new Date();
  const freshnessDays = input.freshnessDays ?? DEFAULT_FRESHNESS_DAYS;
  const discountRatePct = input.discountRatePct ?? 10;
  const warnings: string[] = [];

  const periods = sortPeriods(input.financials.periods);
  if (periods.length === 0) warnings.push("No financial periods available.");

  const latest = periods[0];
  const prior = periods[1];
  const p3 = periods[3];
  const p5 = periods[5];

  // --- Quote (with staleness detection) ---
  let quoteReliability: ReliabilityFlag = REPORTED;
  if (input.quote?.asOf) {
    const ageDays =
      (now.getTime() - new Date(input.quote.asOf).getTime()) / 86_400_000;
    if (ageDays > freshnessDays) {
      quoteReliability = STALE;
      warnings.push(
        `Quote is ${Math.round(ageDays)} days old (> ${freshnessDays}d threshold).`,
      );
    }
  } else if (input.quote) {
    quoteReliability = STALE;
  }

  const ev = enterpriseValue(input.quote, latest);
  const marketCap = input.quote?.marketCap ?? null;

  const latestFcf = latest
    ? periodFcf(latest)
    : { value: null, reliability: MISSING as ReliabilityFlag };

  const roic = computeRoic(latest);

  const roe = latest
    ? mv(marginPct(latest.netIncome, latest.totalEquity), DERIVED, {
        unit: "%",
        note: "Net income / shareholders' equity.",
      })
    : missing("%");

  // --- Balance sheet ---
  const netDebt =
    latest && (isNum(latest.totalDebt) || isNum(latest.cash))
      ? mv((latest.totalDebt ?? 0) - (latest.cash ?? 0), DERIVED, {
          unit: "$",
          note: "Total debt − cash.",
        })
      : missing("$");
  const netDebtToEbitda =
    latest && netDebt.value !== null
      ? mv(safeDiv(netDebt.value, latest.ebitda), DERIVED, { unit: "x" })
      : missing("x");

  // --- Dilution ---
  const shareChange = mv(growthPct(p3?.shares, latest?.shares), DERIVED, {
    unit: "%",
    note: "Change in diluted share count over ~3 years (positive = dilution).",
  });

  // --- Realized volatility (from daily closes) ---
  const closes = (input.priceHistory ?? []).map((p) => p.close);
  const realizedVol = mv(annualizedVolPct(closes), DERIVED, {
    unit: "%",
    note: "Annualized stdev of daily log returns, ~1y window.",
  });
  if (closes.length > 0 && realizedVol.value === null)
    warnings.push("Price history too short for realized volatility (<60 closes).");

  // --- Valuation (current) ---
  const pe = mv(
    safeDiv(marketCap, latest?.netIncome),
    quoteReliability === STALE ? STALE : DERIVED,
    { unit: "x" },
  );
  const evEbitda = mv(
    safeDiv(ev.value, latest?.ebitda),
    ev.reliability === MISSING ? MISSING : DERIVED,
    { unit: "x" },
  );
  const evSales = mv(
    safeDiv(ev.value, latest?.revenue),
    ev.reliability === MISSING ? MISSING : DERIVED,
    { unit: "x" },
  );
  const pFcf = mv(safeDiv(marketCap, latestFcf.value), DERIVED, { unit: "x" });

  // --- Reverse DCF (deterministic; LLM only interprets the output) ---
  const rdcf = solveImpliedGrowth({
    fcf0: latestFcf.value,
    marketCap,
    discountRatePct,
  });
  const reverseDcf: PacketReverseDcf = {
    result: rdcf.result,
    note: rdcf.note,
    reliability: rdcf.result
      ? latestFcf.reliability === REPORTED
        ? DERIVED
        : PROXY
      : MISSING,
  };

  // --- Historical multiple ranges ---
  const hr = input.historicalRatios ?? [];
  const multipleHistory = {
    pe: rangeFrom(hr.map((r) => r.pe).filter(isNum), pe.value),
    evEbitda: rangeFrom(hr.map((r) => r.evEbitda).filter(isNum), evEbitda.value),
    evSales: rangeFrom(hr.map((r) => r.evSales).filter(isNum), evSales.value),
  };
  if (hr.length === 0)
    warnings.push("No historical ratio data — multiple ranges unavailable.");

  // --- Discrepancies (from reconciliation) surface as warnings too ---
  const discrepancies = input.discrepancies ?? [];
  if (discrepancies.length > 0) {
    warnings.push(
      `${discrepancies.length} provider disagreement(s) >2% resolved per normalization policy (EDGAR won; FMP values retained below).`,
    );
  }

  const periodViews = periods.map(buildPeriodView);
  const peers = (input.peers ?? []).map(computePeer);

  const metrics = {
    revenueCagr3y: mv(cagrPct(p3?.revenue, latest?.revenue, 3), DERIVED, { unit: "%" }),
    revenueCagr5y: mv(cagrPct(p5?.revenue, latest?.revenue, 5), DERIVED, { unit: "%" }),
    revenueYoY: mv(growthPct(prior?.revenue, latest?.revenue), DERIVED, { unit: "%" }),
    grossMargin: latest
      ? mv(marginPct(latest.grossProfit, latest.revenue), DERIVED, { unit: "%" })
      : missing("%"),
    opMargin: latest
      ? mv(marginPct(latest.opIncome, latest.revenue), DERIVED, { unit: "%" })
      : missing("%"),
    ebitdaMargin: latest
      ? mv(marginPct(latest.ebitda, latest.revenue), DERIVED, { unit: "%" })
      : missing("%"),
    netMargin: latest
      ? mv(marginPct(latest.netIncome, latest.revenue), DERIVED, { unit: "%" })
      : missing("%"),
    fcfMargin: latest
      ? mv(marginPct(latestFcf.value, latest.revenue), DERIVED, { unit: "%" })
      : missing("%"),
    fcf: mv(latestFcf.value, latestFcf.reliability, { unit: "$" }),
    capexToRevenue: latest
      ? mv(
          latest.capex !== undefined
            ? marginPct(Math.abs(latest.capex), latest.revenue)
            : null,
          DERIVED,
          { unit: "%" },
        )
      : missing("%"),
    roic,
    roe,
    netDebt,
    netDebtToEbitda,
    shareCountChange3y: shareChange,
    realizedVol1yPct: realizedVol,
  };

  const valuation = { pe, evEbitda, evSales, pFcf };

  // --- Data completeness ---
  const tracked: MetricValue[] = [
    metrics.revenueCagr3y, metrics.grossMargin, metrics.opMargin,
    metrics.ebitdaMargin, metrics.netMargin, metrics.fcfMargin, metrics.fcf,
    metrics.roic, metrics.roe, metrics.netDebtToEbitda, metrics.realizedVol1yPct,
    valuation.pe, valuation.evEbitda, valuation.evSales, valuation.pFcf,
  ];
  const populated = tracked.filter((m) => m.value !== null).length;
  const ratio = tracked.length ? populated / tracked.length : 0;
  const labelMap: Array<[MetricValue, string]> = [
    [metrics.grossMargin, "grossMargin"], [metrics.opMargin, "opMargin"],
    [metrics.fcf, "fcf"], [metrics.roic, "roic"], [metrics.roe, "roe"],
    [metrics.realizedVol1yPct, "realizedVol"],
    [valuation.pe, "pe"], [valuation.evEbitda, "evEbitda"],
    [valuation.evSales, "evSales"], [valuation.pFcf, "pFcf"],
  ];
  const completeness: DataCompleteness = {
    populated,
    total: tracked.length,
    ratio: round(ratio) ?? 0,
    level: ratio >= 0.75 ? "HIGH" : ratio >= 0.45 ? "MEDIUM" : "LOW",
    missing: labelMap.filter(([m]) => m.value === null).map(([, n]) => n),
  };

  return {
    ticker: input.profile.ticker,
    asOf: now.toISOString(),
    profile: {
      ticker: input.profile.ticker,
      name: input.profile.name,
      exchange: input.profile.exchange,
      sector: input.profile.sector,
      industry: input.profile.industry,
      country: input.profile.country,
      description: input.profile.description,
    },
    quote: {
      price: mv(input.quote?.price ?? null, quoteReliability, { unit: "$" }),
      marketCap: mv(marketCap, quoteReliability, { unit: "$" }),
      enterpriseValue: mv(ev.value, ev.reliability, { unit: "$" }),
      asOf: input.quote?.asOf,
    },
    metrics,
    valuation,
    reverseDcf,
    periods: periodViews,
    multipleHistory,
    peers,
    completeness,
    sources: input.sources ?? [],
    discrepancies,
    warnings,
  };
}
