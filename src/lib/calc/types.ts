// The "Financial Packet" — the structured, reliability-tagged object produced
// by the deterministic Calc Engine. It is the single source of truth that both
// the Company UI (Phase 1) and the LLM memo pipeline (Phase 2) consume.
//
// Critical design rule: every quantitative value carries a ReliabilityFlag and
// (where applicable) the provider it came from. Numbers never appear without
// provenance, and the LLM is only ever given this packet — it does not invent
// figures.

import type { ReliabilityFlag } from "@/lib/enums";

// A single metric with provenance. `value` is null when unavailable.
export interface MetricValue {
  value: number | null;
  reliability: ReliabilityFlag;
  /** human-readable unit hint: "%", "x", "$", "ratio" */
  unit?: string;
  /** how it was computed / where it came from */
  note?: string;
  sourceKey?: string;
}

export interface PacketProfile {
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  description?: string;
  sourceKey?: string;
}

export interface PacketQuote {
  price: MetricValue;
  marketCap: MetricValue;
  enterpriseValue: MetricValue;
  asOf?: string;
}

// One historical period's computed view (used for trend tables/charts).
export interface PacketPeriod {
  fiscalDate: string;
  periodType: "FY" | "Q";
  revenue: MetricValue;
  grossMargin: MetricValue;
  opMargin: MetricValue;
  ebitdaMargin: MetricValue;
  netMargin: MetricValue;
  fcfMargin: MetricValue;
  fcf: MetricValue;
}

// Summary (latest-period or trailing) metric groups.
export interface PacketMetrics {
  // Growth
  revenueCagr3y: MetricValue;
  revenueCagr5y: MetricValue;
  revenueYoY: MetricValue;
  // Margins (latest FY)
  grossMargin: MetricValue;
  opMargin: MetricValue;
  ebitdaMargin: MetricValue;
  netMargin: MetricValue;
  fcfMargin: MetricValue;
  // Cash generation / capital intensity
  fcf: MetricValue;
  capexToRevenue: MetricValue;
  // Returns
  roic: MetricValue;
  roe: MetricValue;
  // Balance sheet
  netDebt: MetricValue;
  netDebtToEbitda: MetricValue;
  // Dilution
  shareCountChange3y: MetricValue;
}

export interface PacketValuation {
  pe: MetricValue;
  evEbitda: MetricValue;
  evSales: MetricValue;
  pFcf: MetricValue;
}

// Distribution of a multiple over the available history.
export interface MultipleRange {
  min: number | null;
  median: number | null;
  max: number | null;
  current: number | null;
  /** 0-100 percentile of current vs history (100 = most expensive) */
  percentile: number | null;
  reliability: ReliabilityFlag;
}

export interface PacketPeer {
  ticker: string;
  name?: string;
  pe: MetricValue;
  evEbitda: MetricValue;
  evSales: MetricValue;
  grossMargin: MetricValue;
  opMargin: MetricValue;
  revenueCagr3y: MetricValue;
}

// Tracks how much of the packet we could actually populate. Low completeness
// must cap downstream confidence — it never inflates a score.
export interface DataCompleteness {
  populated: number;
  total: number;
  ratio: number; // 0-1
  level: "LOW" | "MEDIUM" | "HIGH";
  missing: string[];
}

export interface SourceProvenance {
  capability: string;
  providerKey: string;
  fetchedAt: string;
}

export interface FinancialPacket {
  ticker: string;
  asOf: string; // ISO
  profile: PacketProfile;
  quote: PacketQuote;
  metrics: PacketMetrics;
  valuation: PacketValuation;
  periods: PacketPeriod[]; // most-recent-first
  multipleHistory: {
    pe: MultipleRange;
    evEbitda: MultipleRange;
    evSales: MultipleRange;
  };
  peers: PacketPeer[];
  completeness: DataCompleteness;
  sources: SourceProvenance[];
  warnings: string[];
}
