// ===========================================================================
// Scoring Engine — deterministic, transparent category scores.
//
// Each of the 10 categories gets a 0-100 score computed from explicit signals
// in the Financial Packet, plus the evidence those signals rest on and a
// data-completeness indicator. Low completeness CAPS the score's confidence —
// it never inflates it. Qualitative categories (moat, industry, management)
// get a conservative quantitative base here; the LLM later supplies narrative
// rationale but cannot override the number. Pure + unit-tested.
// ===========================================================================

import { ScoreCategory } from "@/lib/enums";
import type { FinancialPacket, MetricValue } from "@/lib/calc/types";

export interface ScoreEvidence {
  claim: string;
  sourceType: "API" | "DERIVED" | "INFERENCE";
  ref?: string;
}

export interface CategoryScore {
  category: string;
  value: number; // 0-100
  letter: string; // A-F
  dataCompleteness: "LOW" | "MEDIUM" | "HIGH";
  evidence: ScoreEvidence[];
  /** signals used, for transparency in the UI */
  signals: { label: string; value: string; contribution: number }[];
  /** true if this category needs qualitative LLM judgment to be meaningful */
  needsQualitative: boolean;
}

export interface ScoringResult {
  scores: CategoryScore[];
  composite: number; // weighted average (configurable weights later)
}

const v = (m: MetricValue | undefined): number | null => m?.value ?? null;

function letterFor(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// Maps a value through a piecewise-linear scale to 0-100. `points` is an
// ascending list of [input, output] breakpoints.
function scale(x: number | null, points: [number, number][]): number | null {
  if (x === null) return null;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return last[1];
}

// Combine sub-scores (each possibly null) into a value, tracking completeness.
function combine(
  parts: { label: string; raw: number | null; weight: number; valueStr: string }[],
): { value: number; signals: CategoryScore["signals"]; populated: number; total: number } {
  let wsum = 0;
  let acc = 0;
  let populated = 0;
  const signals: CategoryScore["signals"] = [];
  for (const p of parts) {
    if (p.raw !== null) {
      acc += p.raw * p.weight;
      wsum += p.weight;
      populated++;
      signals.push({ label: p.label, value: p.valueStr, contribution: Math.round(p.raw) });
    } else {
      signals.push({ label: p.label, value: "—", contribution: 0 });
    }
  }
  const value = wsum > 0 ? acc / wsum : 50; // neutral default if nothing populated
  return { value, signals, populated, total: parts.length };
}

function completenessLevel(populated: number, total: number): "LOW" | "MEDIUM" | "HIGH" {
  const r = total ? populated / total : 0;
  return r >= 0.75 ? "HIGH" : r >= 0.4 ? "MEDIUM" : "LOW";
}

function fmt(x: number | null, suffix = ""): string {
  return x === null ? "—" : `${Math.round(x * 100) / 100}${suffix}`;
}

export function computeScores(packet: FinancialPacket): ScoringResult {
  const m = packet.metrics;
  const val = packet.valuation;
  const scores: CategoryScore[] = [];

  const push = (
    category: string,
    parts: Parameters<typeof combine>[0],
    opts: { needsQualitative?: boolean; extraEvidence?: ScoreEvidence[]; floorByCompleteness?: boolean } = {},
  ) => {
    const c = combine(parts);
    const completeness = completenessLevel(c.populated, c.total);
    scores.push({
      category,
      value: Math.round(c.value),
      letter: letterFor(c.value),
      dataCompleteness: completeness,
      evidence: opts.extraEvidence ?? [],
      signals: c.signals,
      needsQualitative: opts.needsQualitative ?? false,
    });
  };

  // --- Business quality: margins + FCF generation ---
  push(ScoreCategory.BUSINESS_QUALITY, [
    { label: "Gross margin", raw: scale(v(m.grossMargin), [[10, 30], [40, 65], [70, 90], [85, 100]]), weight: 1, valueStr: fmt(v(m.grossMargin), "%") },
    { label: "Operating margin", raw: scale(v(m.opMargin), [[0, 20], [15, 60], [30, 90], [40, 100]]), weight: 1.2, valueStr: fmt(v(m.opMargin), "%") },
    { label: "FCF margin", raw: scale(v(m.fcfMargin), [[0, 25], [10, 60], [25, 95], [35, 100]]), weight: 1.2, valueStr: fmt(v(m.fcfMargin), "%") },
  ], { extraEvidence: [{ claim: `Operating margin ${fmt(v(m.opMargin), "%")}, FCF margin ${fmt(v(m.fcfMargin), "%")}`, sourceType: "DERIVED", ref: "metrics.opMargin" }] });

  // --- Moat durability: ROIC + margin level (base); needs qualitative ---
  push(ScoreCategory.MOAT_DURABILITY, [
    { label: "ROIC", raw: scale(v(m.roic), [[5, 25], [12, 60], [25, 90], [40, 100]]), weight: 1.5, valueStr: fmt(v(m.roic), "%") },
    { label: "Gross margin (pricing power proxy)", raw: scale(v(m.grossMargin), [[20, 30], [45, 60], [70, 90]]), weight: 1, valueStr: fmt(v(m.grossMargin), "%") },
  ], { needsQualitative: true, extraEvidence: [{ claim: `ROIC ${fmt(v(m.roic), "%")} (proxy for competitive advantage)`, sourceType: "DERIVED", ref: "metrics.roic" }] });

  // --- Financial strength: leverage + FCF positivity ---
  const leverageScore = scale(v(m.netDebtToEbitda), [[-1, 100], [0, 95], [1.5, 75], [3, 45], [5, 15]]);
  push(ScoreCategory.FINANCIAL_STRENGTH, [
    { label: "Net debt / EBITDA (lower better)", raw: leverageScore, weight: 1.5, valueStr: fmt(v(m.netDebtToEbitda), "×") },
    { label: "FCF margin", raw: scale(v(m.fcfMargin), [[-5, 10], [0, 50], [15, 90], [30, 100]]), weight: 1, valueStr: fmt(v(m.fcfMargin), "%") },
  ], { extraEvidence: [{ claim: `Net debt/EBITDA ${fmt(v(m.netDebtToEbitda), "×")}`, sourceType: "DERIVED", ref: "metrics.netDebtToEbitda" }] });

  // --- Growth runway: revenue CAGR ---
  push(ScoreCategory.GROWTH_RUNWAY, [
    { label: "Revenue CAGR 3y", raw: scale(v(m.revenueCagr3y), [[-5, 15], [5, 45], [15, 75], [30, 95], [50, 100]]), weight: 1.3, valueStr: fmt(v(m.revenueCagr3y), "%") },
    { label: "Revenue YoY", raw: scale(v(m.revenueYoY), [[-10, 15], [5, 45], [20, 80], [40, 100]]), weight: 1, valueStr: fmt(v(m.revenueYoY), "%") },
  ], { needsQualitative: true });

  // --- Valuation attractiveness: percentile vs own history (lower = cheaper) ---
  const pePct = packet.multipleHistory.pe.percentile;
  const evPct = packet.multipleHistory.evEbitda.percentile;
  // Invert percentile: cheap (low percentile) -> high score.
  const invPctScore = (p: number | null) => (p === null ? null : 100 - p);
  push(ScoreCategory.VALUATION, [
    { label: "P/E percentile vs history (cheap=high)", raw: invPctScore(pePct), weight: 1.2, valueStr: pePct === null ? "—" : `${Math.round(pePct)}th` },
    { label: "EV/EBITDA percentile vs history", raw: invPctScore(evPct), weight: 1.2, valueStr: evPct === null ? "—" : `${Math.round(evPct)}th` },
    // Absolute sanity check on EV/EBITDA when no history.
    { label: "EV/EBITDA absolute (lower better)", raw: scale(v(val.evEbitda), [[5, 90], [12, 65], [20, 40], [35, 15]]), weight: 0.8, valueStr: fmt(v(val.evEbitda), "×") },
  ], { extraEvidence: [{ claim: `Trading at ${pePct === null ? "n/a" : Math.round(pePct) + "th"} percentile of its own P/E history`, sourceType: "DERIVED", ref: "multipleHistory.pe" }] });

  // --- Management / execution: dilution (base); needs qualitative ---
  // shareCountChange3y: negative (buybacks) is good.
  const dilutionScore = scale(v(m.shareCountChange3y), [[-15, 100], [-2, 85], [2, 60], [10, 30], [25, 10]]);
  push(ScoreCategory.MANAGEMENT, [
    { label: "Share count Δ3y (buybacks good)", raw: dilutionScore, weight: 1, valueStr: fmt(v(m.shareCountChange3y), "%") },
    { label: "ROIC (capital allocation proxy)", raw: scale(v(m.roic), [[5, 30], [15, 70], [30, 95]]), weight: 1, valueStr: fmt(v(m.roic), "%") },
  ], { needsQualitative: true });

  // --- Industry attractiveness: no quantitative signal in v1 → neutral base ---
  push(ScoreCategory.INDUSTRY, [
    { label: "Operating margin (industry economics proxy)", raw: scale(v(m.opMargin), [[0, 35], [15, 60], [30, 85]]), weight: 1, valueStr: fmt(v(m.opMargin), "%") },
  ], { needsQualitative: true, extraEvidence: [{ claim: "Industry attractiveness is primarily qualitative; quantitative base from margins only.", sourceType: "INFERENCE" }] });

  // --- Risk level: HIGHER score = LOWER risk (consistent direction) ---
  push(ScoreCategory.RISK_LEVEL, [
    { label: "Leverage (low debt = low risk)", raw: leverageScore, weight: 1.3, valueStr: fmt(v(m.netDebtToEbitda), "×") },
    { label: "Valuation richness (expensive = risky)", raw: invPctScore(pePct), weight: 1, valueStr: pePct === null ? "—" : `${Math.round(pePct)}th` },
    { label: "FCF cushion", raw: scale(v(m.fcfMargin), [[-5, 20], [5, 60], [20, 90]]), weight: 1, valueStr: fmt(v(m.fcfMargin), "%") },
  ], { needsQualitative: true });

  // --- Portfolio fit: computed in Phase 4. Neutral placeholder for now. ---
  scores.push({
    category: ScoreCategory.PORTFOLIO_FIT,
    value: 50,
    letter: "C",
    dataCompleteness: "LOW",
    evidence: [{ claim: "Portfolio-fit scoring is implemented in Phase 4 (portfolio engine).", sourceType: "INFERENCE" }],
    signals: [{ label: "Portfolio overlap", value: "pending", contribution: 0 }],
    needsQualitative: false,
  });

  // --- Thesis confidence: driven by data completeness ---
  const compRatio = packet.completeness.ratio;
  push(ScoreCategory.THESIS_CONFIDENCE, [
    { label: "Data completeness", raw: scale(compRatio * 100, [[30, 25], [60, 60], [85, 90], [100, 100]]), weight: 1.5, valueStr: `${Math.round(compRatio * 100)}%` },
    { label: "Valuation visibility", raw: pePct === null ? 35 : 70, weight: 0.8, valueStr: pePct === null ? "no history" : "has history" },
  ], { extraEvidence: [{ claim: `Data completeness ${Math.round(compRatio * 100)}% — confidence is capped accordingly.`, sourceType: "DERIVED", ref: "completeness" }] });

  const composite = Math.round(
    scores.reduce((s, c) => s + c.value, 0) / scores.length,
  );

  return { scores, composite };
}
