// Small, pure numeric helpers used by the Calc Engine. Kept separate so they
// can be unit-tested in isolation. All return null on invalid/insufficient
// input rather than NaN/Infinity, so downstream code can treat null uniformly
// as "unavailable".

export function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Safe division. Returns null if denominator is 0/invalid or inputs missing. */
export function safeDiv(
  num: number | null | undefined,
  den: number | null | undefined,
): number | null {
  if (!isNum(num) || !isNum(den) || den === 0) return null;
  const r = num / den;
  return Number.isFinite(r) ? r : null;
}

/** Margin as a percentage: part / whole * 100. */
export function marginPct(
  part: number | null | undefined,
  whole: number | null | undefined,
): number | null {
  const r = safeDiv(part, whole);
  return r === null ? null : r * 100;
}

/**
 * Compound annual growth rate as a percentage between two values `years` apart.
 * Returns null if either endpoint is non-positive (CAGR is undefined when the
 * base is <= 0) or inputs are invalid.
 */
export function cagrPct(
  start: number | null | undefined,
  end: number | null | undefined,
  years: number,
): number | null {
  if (!isNum(start) || !isNum(end) || start <= 0 || end <= 0 || years <= 0)
    return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/** Simple period-over-period growth as a percentage. */
export function growthPct(
  prev: number | null | undefined,
  curr: number | null | undefined,
): number | null {
  if (!isNum(prev) || !isNum(curr) || prev === 0) return null;
  // Use abs(prev) so a swing from negative to positive reads sensibly.
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function median(values: number[]): number | null {
  const xs = values.filter(isNum).slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function min(values: number[]): number | null {
  const xs = values.filter(isNum);
  return xs.length ? Math.min(...xs) : null;
}

export function max(values: number[]): number | null {
  const xs = values.filter(isNum);
  return xs.length ? Math.max(...xs) : null;
}

/**
 * Percentile rank (0-100) of `current` within `history` (inclusive). 100 means
 * current is at/above the max of history. Returns null if no history.
 */
export function percentileRank(
  current: number | null | undefined,
  history: number[],
): number | null {
  if (!isNum(current)) return null;
  const xs = history.filter(isNum);
  if (xs.length === 0) return null;
  const below = xs.filter((x) => x <= current).length;
  return (below / xs.length) * 100;
}

/** Rounds to `digits` decimals, preserving null. */
export function round(x: number | null, digits = 2): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}
