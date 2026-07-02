// Canonical enum value sets. SQLite/Prisma store these as plain strings,
// so this file is the single source of truth + provides type safety.

export const AnalysisType = {
  STOCK: "STOCK",
} as const;
export type AnalysisType = (typeof AnalysisType)[keyof typeof AnalysisType];

export const AnalysisDepth = {
  QUICK: "QUICK",
  STANDARD: "STANDARD",
  DEEP: "DEEP",
} as const;
export type AnalysisDepth = (typeof AnalysisDepth)[keyof typeof AnalysisDepth];

export const AnalysisStatus = {
  RUNNING: "RUNNING",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
} as const;
export type AnalysisStatus =
  (typeof AnalysisStatus)[keyof typeof AnalysisStatus];

export const MemoRating = {
  ATTRACTIVE: "ATTRACTIVE",
  WATCHLIST: "WATCHLIST",
  AVOID: "AVOID",
  TOO_HARD: "TOO_HARD",
  NEEDS_WORK: "NEEDS_WORK",
} as const;
export type MemoRating = (typeof MemoRating)[keyof typeof MemoRating];

export const Confidence = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;
export type Confidence = (typeof Confidence)[keyof typeof Confidence];

// How trustworthy a single datum is. Surfaced visibly in the UI and memo.
// Semantics are defined in docs/normalization-policy.md §4.
export const ReliabilityFlag = {
  REPORTED: "REPORTED",
  DERIVED: "DERIVED",
  PROXY: "PROXY",
  STALE: "STALE",
  MISSING: "MISSING",
} as const;
export type ReliabilityFlag =
  (typeof ReliabilityFlag)[keyof typeof ReliabilityFlag];

// Nine scoring categories. portfolio_fit is intentionally absent in v1:
// there is no portfolio data to score against, and a placeholder score would
// violate the transparency rule. It returns with the portfolio phase.
export const ScoreCategory = {
  BUSINESS_QUALITY: "business_quality",
  MOAT_DURABILITY: "moat_durability",
  FINANCIAL_STRENGTH: "financial_strength",
  GROWTH_RUNWAY: "growth_runway",
  VALUATION: "valuation_attractiveness",
  MANAGEMENT: "management_execution",
  INDUSTRY: "industry_attractiveness",
  RISK_LEVEL: "risk_level",
  THESIS_CONFIDENCE: "thesis_confidence",
} as const;
export type ScoreCategory = (typeof ScoreCategory)[keyof typeof ScoreCategory];

export const ProviderKind = {
  DATA: "DATA",
  LLM: "LLM",
} as const;
export type ProviderKind = (typeof ProviderKind)[keyof typeof ProviderKind];
