// Canonical enum value sets. SQLite/Prisma store these as plain strings,
// so this file is the single source of truth + provides type safety.

export const AnalysisType = {
  STOCK: "STOCK",
  SECTOR_THEME: "SECTOR_THEME",
  ETF: "ETF",
  PORTFOLIO_IMPACT: "PORTFOLIO_IMPACT",
} as const;
export type AnalysisType = (typeof AnalysisType)[keyof typeof AnalysisType];

export const AnalysisDepth = {
  QUICK: "QUICK",
  STANDARD: "STANDARD",
  DEEP: "DEEP",
} as const;
export type AnalysisDepth = (typeof AnalysisDepth)[keyof typeof AnalysisDepth];

export const AnalysisStatus = {
  DRAFT: "DRAFT",
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

// How trustworthy a single financial datum is. Surfaced visibly in the UI.
export const ReliabilityFlag = {
  REPORTED: "REPORTED", // pulled directly from a filing/provider as-reported
  DERIVED: "DERIVED", // computed by our Calc Engine from reported inputs
  ESTIMATE: "ESTIMATE", // analyst/consensus estimate, not actual
  PROXY: "PROXY", // a stand-in metric because the real one is unavailable
  STALE: "STALE", // older than the freshness threshold
  MISSING: "MISSING", // unavailable
} as const;
export type ReliabilityFlag =
  (typeof ReliabilityFlag)[keyof typeof ReliabilityFlag];

export const ThesisStatus = {
  INTACT: "INTACT",
  WEAKENING: "WEAKENING",
  BROKEN: "BROKEN",
  PLAYED_OUT: "PLAYED_OUT",
} as const;
export type ThesisStatus = (typeof ThesisStatus)[keyof typeof ThesisStatus];

export const ScoreCategory = {
  BUSINESS_QUALITY: "business_quality",
  MOAT_DURABILITY: "moat_durability",
  FINANCIAL_STRENGTH: "financial_strength",
  GROWTH_RUNWAY: "growth_runway",
  VALUATION: "valuation_attractiveness",
  MANAGEMENT: "management_execution",
  INDUSTRY: "industry_attractiveness",
  RISK_LEVEL: "risk_level",
  PORTFOLIO_FIT: "portfolio_fit",
  THESIS_CONFIDENCE: "thesis_confidence",
} as const;
export type ScoreCategory =
  (typeof ScoreCategory)[keyof typeof ScoreCategory];

export const ProviderKind = {
  DATA: "DATA",
  LLM: "LLM",
} as const;
export type ProviderKind = (typeof ProviderKind)[keyof typeof ProviderKind];
