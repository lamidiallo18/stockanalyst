// ===========================================================================
// Scoring Engine — deterministic, transparent category scores.
//
// Nine categories (portfolio_fit is out of v1 scope — no data to score), each
// 0-100 with a letter band, computed from explicit signals in the Financial
// Packet. Amendment 4 rules:
//   - Qualitative categories are COMPARATIVE against the peer set when >= 3
//     peers carry the metric; absolute scales are the fallback and flagged.
//   - Any score > 80 or < 40 must rest on >= 2 evidence refs, or the engine
//     clamps it to the boundary and flags it (`clamped: true`).
// Low data completeness caps confidence, never inflates it. The LLM writes
// rationale prose around these numbers but cannot change them. Pure module.
// ===========================================================================

import { ScoreCategory } from "@/lib/enums";
import type { FinancialPacket, MetricValue } from "@/lib/calc/types";
import { percentileRank } from "@/lib/calc/math";

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
  /** true if the anti-regression clamp fired (amendment 4) */
  clamped: boolean;
  /** true if scored comparatively vs the peer set */
  comparative: boolean;
}

export interface ScoringResult {
  scores: CategoryScore[];
  composite: number;
}

const CLAMP_HIGH = 80;
const CLAMP_LOW = 40;
const MIN_EVIDENCE_FOR_EXTREME = 2;
const MIN_PEERS_FOR_COMPARATIVE = 3;

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

// Comparative score: percentile of the company's metric within the peer set,
// mapped to 10-90 (never awards the extremes on relative standing alone).
function comparativeScore(
  own: number | null,
  peerValues: number[],
): number | null {
  if (own === null || peerValues.length < MIN_PEERS_FOR_COMPARATIVE) return null;
  const pct = percentileRank(own, [...peerValues, own]);
  if (pct === null) return null;
  return 10 + 0.8 * pct;
}

interface Part {
  label: string;
  raw: number | null;
  weight: number;
  valueStr: string;
}

function combine(parts: Part[]): {
  value: number;
  signals: CategoryScore["signals"];
  populated: number;
  total: number;
} {
  let wsum = 0;
  let acc = 0;
  let populated = 0;
  const signals: CategoryScore["signals"] = [];
  for (const p of parts) {
    if (p.raw !== null) {
      acc += p.raw * p.weight;
      wsum += p.weight;
      populated++;
      signals.push({
        label: p.label,
        value: p.valueStr,
        contribution: Math.round(p.raw),
      });
    } else {
      signals.push({ label: p.label, value: "—", contribution: 0 });
    }
  }
  const value = wsum > 0 ? acc / wsum : 50; // neutral default if nothing populated
  return { value, signals, populated, total: parts.length };
}

function completenessLevel(
  populated: number,
  total: number,
): "LOW" | "MEDIUM" | "HIGH" {
  const r = total ? populated / total : 0;
  return r >= 0.75 ? "HIGH" : r >= 0.4 ? "MEDIUM" : "LOW";
}

function fmt(x: number | null, suffix = ""): string {
  return x === null ? "—" : `${Math.round(x * 100) / 100}${suffix}`;
}

// Applies the amendment-4 clamp: extreme scores need >= 2 evidence refs.
export function applyClamp(
  value: number,
  evidenceCount: number,
): { value: number; clamped: boolean } {
  const rounded = Math.round(value);
  if (rounded > CLAMP_HIGH && evidenceCount < MIN_EVIDENCE_FOR_EXTREME) {
    return { value: CLAMP_HIGH, clamped: true };
  }
  if (rounded < CLAMP_LOW && evidenceCount < MIN_EVIDENCE_FOR_EXTREME) {
    return { value: CLAMP_LOW, clamped: true };
  }
  return { value: rounded, clamped: false };
}

export function computeScores(packet: FinancialPacket): ScoringResult {
  const m = packet.metrics;
  const val = packet.valuation;
  const peers = packet.peers;
  const scores: CategoryScore[] = [];

  // Peer metric arrays for comparative scoring.
  const peerVals = (f: (p: FinancialPacket["peers"][number]) => number | null) =>
    peers.map(f).filter((x): x is number => x !== null);
  const peerOpMargins = peerVals((p) => p.opMargin.value);
  const peerGrossMargins = peerVals((p) => p.grossMargin.value);
  const peerRoics = peerVals((p) => p.roic.value);
  const peerGrowth = peerVals((p) => p.revenueCagr3y.value);

  const push = (
    category: string,
    parts: Part[],
    opts: {
      needsQualitative?: boolean;
      comparative?: boolean;
      evidence?: ScoreEvidence[];
    } = {},
  ) => {
    const c = combine(parts);
    const evidence = opts.evidence ?? [];
    // Populated signals count as evidence refs (each is a traceable datum).
    const evidenceCount =
      evidence.length + c.signals.filter((s) => s.value !== "—").length;
    const { value, clamped } = applyClamp(c.value, evidenceCount);
    scores.push({
      category,
      value,
      letter: letterFor(value),
      dataCompleteness: completenessLevel(c.populated, c.total),
      evidence,
      signals: c.signals,
      needsQualitative: opts.needsQualitative ?? false,
      clamped,
      comparative: opts.comparative ?? false,
    });
  };

  // --- Business quality: margins + FCF generation (comparative when possible) ---
  {
    const compOp = comparativeScore(v(m.opMargin), peerOpMargins);
    push(
      ScoreCategory.BUSINESS_QUALITY,
      [
        {
          label: compOp !== null ? "Op margin vs peers" : "Operating margin",
          raw:
            compOp ??
            scale(v(m.opMargin), [[0, 20], [15, 60], [30, 90], [40, 100]]),
          weight: 1.2,
          valueStr: fmt(v(m.opMargin), "%"),
        },
        {
          label: "Gross margin",
          raw: scale(v(m.grossMargin), [[10, 30], [40, 65], [70, 90], [85, 100]]),
          weight: 1,
          valueStr: fmt(v(m.grossMargin), "%"),
        },
        {
          label: "FCF margin",
          raw: scale(v(m.fcfMargin), [[0, 25], [10, 60], [25, 95], [35, 100]]),
          weight: 1.2,
          valueStr: fmt(v(m.fcfMargin), "%"),
        },
      ],
      {
        comparative: compOp !== null,
        evidence: [
          {
            claim: `Operating margin ${fmt(v(m.opMargin), "%")}, FCF margin ${fmt(v(m.fcfMargin), "%")}`,
            sourceType: "DERIVED",
            ref: "metrics.opMargin",
          },
        ],
      },
    );
  }

  // --- Moat durability: ROIC + gross margin, comparative (qualitative) ---
  {
    const compRoic = comparativeScore(v(m.roic), peerRoics);
    const compGm = comparativeScore(v(m.grossMargin), peerGrossMargins);
    push(
      ScoreCategory.MOAT_DURABILITY,
      [
        {
          label: compRoic !== null ? "ROIC vs peers" : "ROIC (absolute)",
          raw:
            compRoic ??
            scale(v(m.roic), [[5, 25], [12, 60], [25, 90], [40, 100]]),
          weight: 1.5,
          valueStr: fmt(v(m.roic), "%"),
        },
        {
          label:
            compGm !== null
              ? "Gross margin vs peers (pricing power)"
              : "Gross margin (pricing power)",
          raw:
            compGm ?? scale(v(m.grossMargin), [[20, 30], [45, 60], [70, 90]]),
          weight: 1,
          valueStr: fmt(v(m.grossMargin), "%"),
        },
      ],
      {
        needsQualitative: true,
        comparative: compRoic !== null || compGm !== null,
        evidence: [
          {
            claim: `ROIC ${fmt(v(m.roic), "%")} vs peer set of ${peerRoics.length}`,
            sourceType: "DERIVED",
            ref: "metrics.roic",
          },
        ],
      },
    );
  }

  // --- Financial strength: leverage + FCF ---
  const leverageScore = scale(v(m.netDebtToEbitda), [
    [-1, 100], [0, 95], [1.5, 75], [3, 45], [5, 15],
  ]);
  push(
    ScoreCategory.FINANCIAL_STRENGTH,
    [
      {
        label: "Net debt / EBITDA (lower better)",
        raw: leverageScore,
        weight: 1.5,
        valueStr: fmt(v(m.netDebtToEbitda), "×"),
      },
      {
        label: "FCF margin",
        raw: scale(v(m.fcfMargin), [[-5, 10], [0, 50], [15, 90], [30, 100]]),
        weight: 1,
        valueStr: fmt(v(m.fcfMargin), "%"),
      },
    ],
    {
      evidence: [
        {
          claim: `Net debt/EBITDA ${fmt(v(m.netDebtToEbitda), "×")}`,
          sourceType: "DERIVED",
          ref: "metrics.netDebtToEbitda",
        },
      ],
    },
  );

  // --- Growth runway: revenue CAGR (comparative when possible; qualitative) ---
  {
    const compG = comparativeScore(v(m.revenueCagr3y), peerGrowth);
    push(
      ScoreCategory.GROWTH_RUNWAY,
      [
        {
          label: compG !== null ? "Rev CAGR 3y vs peers" : "Revenue CAGR 3y",
          raw:
            compG ??
            scale(v(m.revenueCagr3y), [[-5, 15], [5, 45], [15, 75], [30, 95], [50, 100]]),
          weight: 1.3,
          valueStr: fmt(v(m.revenueCagr3y), "%"),
        },
        {
          label: "Revenue YoY",
          raw: scale(v(m.revenueYoY), [[-10, 15], [5, 45], [20, 80], [40, 100]]),
          weight: 1,
          valueStr: fmt(v(m.revenueYoY), "%"),
        },
      ],
      { needsQualitative: true, comparative: compG !== null },
    );
  }

  // --- Valuation attractiveness: percentile vs own history + implied growth ---
  {
    const pePct = packet.multipleHistory.pe.percentile;
    const evPct = packet.multipleHistory.evEbitda.percentile;
    const invPctScore = (p: number | null) => (p === null ? null : 100 - p);
    const implied = packet.reverseDcf.result?.impliedFcfCagrPct ?? null;
    // Cheaper = the market implies less growth. Implied <=3% scores high;
    // implied >=25% scores low.
    const impliedScore = scale(implied, [[3, 85], [10, 60], [18, 35], [25, 15]]);
    push(
      ScoreCategory.VALUATION,
      [
        {
          label: "P/E percentile vs history (cheap=high)",
          raw: invPctScore(pePct),
          weight: 1.2,
          valueStr: pePct === null ? "—" : `${Math.round(pePct)}th`,
        },
        {
          label: "EV/EBITDA percentile vs history",
          raw: invPctScore(evPct),
          weight: 1.2,
          valueStr: evPct === null ? "—" : `${Math.round(evPct)}th`,
        },
        {
          label: "Implied FCF growth (reverse DCF, lower=cheaper)",
          raw: impliedScore,
          weight: 1.4,
          valueStr: implied === null ? "—" : `${implied}%/yr`,
        },
        {
          label: "EV/EBITDA absolute (lower better)",
          raw: scale(v(val.evEbitda), [[5, 90], [12, 65], [20, 40], [35, 15]]),
          weight: 0.6,
          valueStr: fmt(v(val.evEbitda), "×"),
        },
      ],
      {
        evidence: [
          {
            claim:
              implied === null
                ? "Reverse DCF unavailable"
                : `Market prices in ~${implied}%/yr FCF growth over 10y (reverse DCF)`,
            sourceType: "DERIVED",
            ref: "reverseDcf",
          },
          {
            claim: `P/E at ${pePct === null ? "n/a" : Math.round(pePct) + "th"} percentile of own history`,
            sourceType: "DERIVED",
            ref: "multipleHistory.pe",
          },
        ],
      },
    );
  }

  // --- Management / execution: dilution + ROIC (qualitative) ---
  push(
    ScoreCategory.MANAGEMENT,
    [
      {
        label: "Share count Δ3y (buybacks good)",
        raw: scale(v(m.shareCountChange3y), [[-15, 100], [-2, 85], [2, 60], [10, 30], [25, 10]]),
        weight: 1,
        valueStr: fmt(v(m.shareCountChange3y), "%"),
      },
      {
        label: "ROIC (capital allocation proxy)",
        raw: scale(v(m.roic), [[5, 30], [15, 70], [30, 95]]),
        weight: 1,
        valueStr: fmt(v(m.roic), "%"),
      },
    ],
    { needsQualitative: true },
  );

  // --- Industry attractiveness: margins proxy (qualitative-heavy) ---
  push(
    ScoreCategory.INDUSTRY,
    [
      {
        label: "Operating margin (industry economics proxy)",
        raw: scale(v(m.opMargin), [[0, 35], [15, 60], [30, 85]]),
        weight: 1,
        valueStr: fmt(v(m.opMargin), "%"),
      },
    ],
    {
      needsQualitative: true,
      evidence: [
        {
          claim:
            "Industry attractiveness is primarily qualitative; quantitative base from margins only.",
          sourceType: "INFERENCE",
        },
      ],
    },
  );

  // --- Risk level: HIGHER score = LOWER risk ---
  {
    const pePct = packet.multipleHistory.pe.percentile;
    const vol = v(m.realizedVol1yPct);
    push(
      ScoreCategory.RISK_LEVEL,
      [
        {
          label: "Leverage (low debt = low risk)",
          raw: leverageScore,
          weight: 1.3,
          valueStr: fmt(v(m.netDebtToEbitda), "×"),
        },
        {
          label: "Realized vol 1y (low = low risk)",
          raw: scale(vol, [[15, 90], [25, 70], [40, 45], [60, 20], [90, 5]]),
          weight: 1.2,
          valueStr: fmt(vol, "%"),
        },
        {
          label: "Valuation richness (expensive = risky)",
          raw: pePct === null ? null : 100 - pePct,
          weight: 1,
          valueStr: pePct === null ? "—" : `${Math.round(pePct)}th`,
        },
        {
          label: "FCF cushion",
          raw: scale(v(m.fcfMargin), [[-5, 20], [5, 60], [20, 90]]),
          weight: 1,
          valueStr: fmt(v(m.fcfMargin), "%"),
        },
      ],
      { needsQualitative: true },
    );
  }

  // --- Thesis confidence: driven by data completeness ---
  {
    const compRatio = packet.completeness.ratio;
    const pePct = packet.multipleHistory.pe.percentile;
    push(
      ScoreCategory.THESIS_CONFIDENCE,
      [
        {
          label: "Data completeness",
          raw: scale(compRatio * 100, [[30, 25], [60, 60], [85, 90], [100, 100]]),
          weight: 1.5,
          valueStr: `${Math.round(compRatio * 100)}%`,
        },
        {
          label: "Valuation visibility",
          raw: pePct === null ? 35 : 70,
          weight: 0.8,
          valueStr: pePct === null ? "no history" : "has history",
        },
      ],
      {
        evidence: [
          {
            claim: `Data completeness ${Math.round(compRatio * 100)}% — confidence is capped accordingly.`,
            sourceType: "DERIVED",
            ref: "completeness",
          },
        ],
      },
    );
  }

  const composite = Math.round(
    scores.reduce((s, c) => s + c.value, 0) / scores.length,
  );

  return { scores, composite };
}
