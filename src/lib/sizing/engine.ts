// Position-sizing engine — deterministic and transparent (amendment 5).
//
//   mid = base(confidence) × riskAdj(risk score) × volAdj(realized vol)
//   range = [mid × 0.6, min(cap, mid × 1.1)]
//
// - base: fraction of the single-name cap set by thesis confidence.
// - riskAdj: 0.6–1.2 from the risk_level category score (higher score = lower
//   risk = larger size).
// - volAdj: sqrt(targetVol / realizedVol), clamped to [0.5, 1.2]. When price
//   history is insufficient, volAdj = 1 and the rationale flags it as a PROXY.
// - Pairwise correlation vs holdings requires a portfolio, which is out of v1
//   scope; it activates with the portfolio phase. No tag-based proxy exists.
//
// The LLM never generates or adjusts sizing; it only interprets this output.
// Pure module — unit-tested.

export interface SizingInput {
  confidence: "LOW" | "MEDIUM" | "HIGH";
  /** risk_level category score, 0-100, higher = lower risk */
  riskScore: number | null;
  /** annualized realized vol %, null if price history insufficient */
  realizedVolPct: number | null;
  /** Settings → sizingPolicy */
  maxSingleNamePct: number;
  targetVolPct: number;
}

export interface SizingResult {
  lowPct: number;
  highPct: number;
  rationale: string;
  usedVolProxy: boolean;
}

const BASE_BY_CONFIDENCE = { HIGH: 0.9, MEDIUM: 0.55, LOW: 0.3 } as const;

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function suggestSize(input: SizingInput): SizingResult {
  const cap = input.maxSingleNamePct;
  const base = cap * BASE_BY_CONFIDENCE[input.confidence];

  const risk = input.riskScore ?? 50;
  const riskAdj = 0.6 + 0.6 * (risk / 100); // 0.6 .. 1.2

  let volAdj = 1;
  let usedVolProxy = true;
  if (
    input.realizedVolPct !== null &&
    Number.isFinite(input.realizedVolPct) &&
    input.realizedVolPct > 0
  ) {
    volAdj = Math.sqrt(input.targetVolPct / input.realizedVolPct);
    volAdj = Math.min(1.2, Math.max(0.5, volAdj));
    usedVolProxy = false;
  }

  const mid = base * riskAdj * volAdj;
  const low = Math.max(0, round1(mid * 0.6));
  const high = Math.min(cap, round1(mid * 1.1));

  const rationale =
    `base ${round1(base)}% (confidence ${input.confidence}, cap ${cap}%) × ` +
    `risk ${round1(riskAdj * 100) / 100} (risk score ${risk}/100) × ` +
    (usedVolProxy
      ? `vol 1.00 (PROXY — insufficient price history) `
      : `vol ${round1(volAdj * 100) / 100} (realized ${round1(input.realizedVolPct!)}% vs target ${input.targetVolPct}%) `) +
    `→ ${low}–${Math.max(low, high)}%. Correlation adjustment requires portfolio data (not in v1 scope).`;

  return { lowPct: low, highPct: Math.max(low, high), rationale, usedVolProxy };
}
