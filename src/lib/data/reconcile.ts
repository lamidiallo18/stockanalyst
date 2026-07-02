// Cross-provider reconciliation — implements docs/normalization-policy.md §3.
//
// FMP is the base dataset; EDGAR is authoritative for reported fundamentals.
// Periods are joined by fiscal YEAR of the period end date (tolerating small
// end-date drift between vendors). Field by field:
//   - FMP missing, EDGAR present  -> EDGAR fills the gap
//   - both present, |diff| <= 2%  -> FMP stands (internal consistency)
//   - both present, |diff| >  2%  -> EDGAR wins; the losing FMP value is
//     recorded as a Discrepancy — stored and surfaced, never discarded.
// Derived fields (ebitda, fcf) are exempt: EDGAR never overrides them.
//
// Pure module (no I/O) — unit-tested per the policy's §5 obligations.

import type { NormalizedFinancials, NormalizedPeriod } from "@/lib/plugins/types";

export const DISAGREEMENT_THRESHOLD = 0.02; // 2%

// Reported-fundamental fields subject to reconciliation. ebitda/fcf are
// vendor-derived and deliberately absent (policy §3, derived-field exemption).
const RECONCILED_FIELDS = [
  "revenue",
  "grossProfit",
  "opIncome",
  "netIncome",
  "pretaxIncome",
  "incomeTax",
  "ocf",
  "capex",
  "totalDebt",
  "cash",
  "totalEquity",
  "shares",
] as const;
type ReconciledField = (typeof RECONCILED_FIELDS)[number];

export interface Discrepancy {
  field: string;
  fiscalDate: string;
  chosenProvider: string;
  chosenValue: number;
  otherProvider: string;
  otherValue: number;
  pctDiff: number; // relative difference, as a percentage
}

export interface ReconcileResult {
  financials: NormalizedFinancials;
  discrepancies: Discrepancy[];
  /** count of fields filled from EDGAR where FMP had gaps */
  filled: number;
}

function fiscalYearOf(iso: string): number {
  return new Date(iso).getUTCFullYear();
}

function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}

export function reconcileFinancials(
  fmp: NormalizedFinancials,
  edgar: NormalizedFinancials | null,
): ReconcileResult {
  if (!edgar || edgar.periods.length === 0) {
    return { financials: fmp, discrepancies: [], filled: 0 };
  }

  const edgarByYear = new Map<number, NormalizedPeriod>();
  for (const p of edgar.periods) {
    if (p.periodType === "FY") edgarByYear.set(fiscalYearOf(p.fiscalDate), p);
  }

  const discrepancies: Discrepancy[] = [];
  let filled = 0;

  const periods = fmp.periods.map((p): NormalizedPeriod => {
    if (p.periodType !== "FY") return p;
    const e = edgarByYear.get(fiscalYearOf(p.fiscalDate));
    if (!e) return p;

    const merged: NormalizedPeriod = { ...p };
    for (const field of RECONCILED_FIELDS) {
      const fv = p[field as ReconciledField];
      const ev = e[field as ReconciledField];
      if (ev === undefined) continue; // EDGAR gap: FMP value stands (§2.1)
      if (fv === undefined) {
        // Fill from EDGAR.
        (merged as unknown as Record<string, unknown>)[field] = ev;
        filled++;
        continue;
      }
      const d = relDiff(fv, ev);
      if (d > DISAGREEMENT_THRESHOLD) {
        // EDGAR wins for reported fundamentals; FMP value stored + surfaced.
        (merged as unknown as Record<string, unknown>)[field] = ev;
        discrepancies.push({
          field,
          fiscalDate: p.fiscalDate,
          chosenProvider: "edgar",
          chosenValue: ev,
          otherProvider: "fmp",
          otherValue: fv,
          pctDiff: Math.round(d * 10000) / 100,
        });
      }
      // <= 2%: FMP stands.
    }
    return merged;
  });

  return { financials: { ticker: fmp.ticker, periods }, discrepancies, filled };
}
