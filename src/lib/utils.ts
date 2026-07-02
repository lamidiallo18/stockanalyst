// Tiny className combiner + display formatters shared across the UI.

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

// Compact money: 1.23T / 45.6B / 789M / 12.3K. Handles negatives.
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suf] of units) {
    if (a >= div) return `${sign}$${(a / div).toFixed(2)}${suf}`;
  }
  return `${sign}$${a.toFixed(2)}`;
}

export function formatNum(
  n: number | null | undefined,
  digits = 2,
  suffix = "",
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

// Render a MetricValue-style {value, unit} into a display string.
export function formatMetric(
  value: number | null | undefined,
  unit?: string,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit === "%") return formatPct(value);
  if (unit === "x") return formatNum(value, 1, "×");
  if (unit === "$") return formatMoney(value);
  return formatNum(value);
}

export function formatUsd(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${n.toFixed(digits)}`;
}
