// Reverse DCF — fully deterministic implied-expectations solver (amendment 3).
//
// Question answered: "what constant FCF growth rate over the next 10 years
// does today's market cap imply?" Solved by bisection on g in:
//
//   marketCap = Σ_{t=1..H} FCF0·(1+g)^t / (1+r)^t
//             + [FCF0·(1+g)^H · (1+gT) / (r − gT)] / (1+r)^H
//
// Pinned constants (documented, not settings):
//   - HORIZON_YEARS = 10 (explicit horizon)
//   - TERMINAL: perpetuity growth (Gordon) at TERMINAL_GROWTH_PCT = 2.5%
//     (chosen over a terminal multiple: it makes the equation self-contained
//     and avoids importing a second market assumption)
// Configurable input (Settings → valuationPolicy): discount rate, default 10%.
//
// Equity-side convention: FCF here is free cash flow to equity proxied by
// OCF − capex, matched against MARKET CAP (not EV). The proxy is disclosed in
// the output. The LLM never generates or adjusts these figures — it only
// interprets the computed output.

export const HORIZON_YEARS = 10;
export const TERMINAL_GROWTH_PCT = 2.5;

export interface ReverseDcfInputs {
  fcf0: number; // latest FY free cash flow
  marketCap: number;
  discountRatePct: number; // from Settings; default 10
  horizonYears: number; // always HORIZON_YEARS; echoed for transparency
  terminalGrowthPct: number; // always TERMINAL_GROWTH_PCT; echoed
}

export interface ReverseDcfResult {
  impliedFcfCagrPct: number;
  inputs: ReverseDcfInputs;
}

/** Present value of the FCF stream + Gordon terminal value at growth g. */
export function presentValue(
  fcf0: number,
  g: number, // decimal, e.g. 0.08
  r: number, // decimal discount rate
  horizonYears: number,
  gT: number, // decimal terminal growth
): number {
  let pv = 0;
  let fcf = fcf0;
  for (let t = 1; t <= horizonYears; t++) {
    fcf *= 1 + g;
    pv += fcf / Math.pow(1 + r, t);
  }
  const terminal = (fcf * (1 + gT)) / (r - gT);
  pv += terminal / Math.pow(1 + r, horizonYears);
  return pv;
}

const G_LOW = -0.5;
const G_HIGH = 1.0;
const ITERATIONS = 80;

/**
 * Solves for the implied FCF growth rate. Returns null (with a reason) when
 * the computation is undefined:
 *   - FCF0 <= 0 (implied growth of a negative base is meaningless)
 *   - marketCap missing/non-positive
 *   - discount rate <= terminal growth (Gordon undefined)
 *   - price outside the solvable band (implied g < -50% or > +100%)
 */
export function solveImpliedGrowth(args: {
  fcf0: number | null | undefined;
  marketCap: number | null | undefined;
  discountRatePct: number;
}): { result: ReverseDcfResult | null; note: string } {
  const { fcf0, marketCap, discountRatePct } = args;
  const r = discountRatePct / 100;
  const gT = TERMINAL_GROWTH_PCT / 100;

  if (typeof fcf0 !== "number" || !Number.isFinite(fcf0) || fcf0 <= 0) {
    return {
      result: null,
      note: "Reverse DCF unavailable: latest FCF is non-positive or missing.",
    };
  }
  if (
    typeof marketCap !== "number" ||
    !Number.isFinite(marketCap) ||
    marketCap <= 0
  ) {
    return { result: null, note: "Reverse DCF unavailable: no market cap." };
  }
  if (r <= gT) {
    return {
      result: null,
      note: `Reverse DCF undefined: discount rate (${discountRatePct}%) must exceed terminal growth (${TERMINAL_GROWTH_PCT}%).`,
    };
  }

  const pvAt = (g: number) => presentValue(fcf0, g, r, HORIZON_YEARS, gT);

  if (marketCap < pvAt(G_LOW)) {
    return {
      result: null,
      note: "Reverse DCF out of range: price implies FCF decline beyond -50%/yr.",
    };
  }
  if (marketCap > pvAt(G_HIGH)) {
    return {
      result: null,
      note: "Reverse DCF out of range: price implies FCF growth above +100%/yr.",
    };
  }

  // PV is strictly increasing in g -> bisection converges.
  let lo = G_LOW;
  let hi = G_HIGH;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (pvAt(mid) < marketCap) lo = mid;
    else hi = mid;
  }
  const g = (lo + hi) / 2;

  return {
    result: {
      impliedFcfCagrPct: Math.round(g * 10000) / 100,
      inputs: {
        fcf0,
        marketCap,
        discountRatePct,
        horizonYears: HORIZON_YEARS,
        terminalGrowthPct: TERMINAL_GROWTH_PCT,
      },
    },
    note: `Implied ${HORIZON_YEARS}y FCF CAGR at ${discountRatePct}% discount, ${TERMINAL_GROWTH_PCT}% perpetuity terminal growth. FCF = OCF − capex (equity-side proxy vs market cap).`,
  };
}
