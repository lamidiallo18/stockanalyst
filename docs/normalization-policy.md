# Normalization & Reconciliation Policy

This document governs how StockAnalyst turns raw provider data into the
canonical financials that ground every memo. It is a first-class workstream:
the rules here are implemented in `src/lib/plugins/data/*.normalize.ts` and
`src/lib/data/reconcile.ts`, and unit-tested. Changes to this policy require
changes to those modules and their tests in the same commit.

## 1. Provider roles (priority hierarchy)

| Data class | Authoritative source | Rationale |
|---|---|---|
| **Reported fundamentals** (revenue, income, balance-sheet items, share counts as filed) | **SEC EDGAR** (XBRL companyfacts) | Values come directly from filings; no vendor transformation. |
| **Market data** (price, market cap, price history) | **FMP** | EDGAR has no market data. |
| **Derived/convenience data** (precomputed ratios, EBITDA, peer lists) | **FMP** | Vendor-computed; EDGAR does not supply them. |

FMP is the *base dataset* (it covers more fields per period). EDGAR is the
*authority* that can override it, per §3.

## 2. EDGAR XBRL handling

### 2.1 Concept selection (custom tags)

Companies file under varying us-gaap concepts, and some use custom extension
tags we cannot enumerate. Policy:

- For each canonical field we maintain an **ordered candidate list** of us-gaap
  concepts (e.g. revenue: `RevenueFromContractWithCustomerExcludingAssessedTax`
  → `Revenues` → `SalesRevenueNet`). First concept with data wins per period;
  later candidates only fill periods the earlier ones missed.
- **Custom extension tags are not read.** If a company reports a field only
  under a custom tag, that field is `MISSING` from EDGAR for that period and
  the FMP value (if any) stands **flagged as unreconciled** (`REPORTED`
  reliability from a single source, noted in packet warnings). We prefer an
  honest gap over guessing at issuer-specific taxonomies.

### 2.2 Fiscal years (non-calendar)

- Annual values are selected by **duration window**, not calendar year: a
  10-K duration fact qualifies as annual if its start→end span is 350–380
  days. This handles non-calendar fiscal years (AAPL's September FYE) and
  52/53-week retail calendars (up to 371 days) without special-casing.
- The **fiscal period key** is the period end date (`fiscalDate`). Cross-
  provider matching joins on the *year* of the end date, tolerating small
  end-date drift between vendors (e.g. `2023-09-30` vs `2023-10-01`).
- Instant (balance-sheet) facts are taken at the period end date of the
  matched annual filing.

### 2.3 Restatements

XBRL companyfacts contains every filing of a fact, so a restated year appears
multiple times with different `filed` dates. Policy: **latest-filed wins** —
for duplicate period-ends we keep the value from the most recently filed 10-K.
This means restated figures silently replace originals, which is the correct
default for analysis (you want the company's current view of its history).
The as-originally-filed value is not retained in v1; if restatement *tracking*
becomes a requirement it is a schema change, not a policy change.

## 3. Cross-provider reconciliation

Applied whenever both FMP and EDGAR return fundamentals for the same ticker.

- **Matching:** periods are joined by fiscal-year of the period end date
  (§2.2). Fields compared: revenue, gross profit, operating income, net
  income, pretax income, income tax, OCF, capex, total debt, cash, total
  equity, diluted shares.
- **Fill:** if FMP lacks a field for a period and EDGAR has it, the EDGAR
  value fills the gap (tagged `REPORTED`, source `edgar`).
- **Agreement band:** if both providers have the field and the relative
  difference is **≤ 2%**, the FMP value stands (it keeps the dataset's
  internal consistency with FMP-only fields like EBITDA).
- **Disagreement (> 2%):** the **EDGAR value wins** for reported fundamentals
  (§1). The losing FMP value is **stored** as a `Reconciliation` row
  (field, period, both values, % difference) and **surfaced**: the packet
  carries the discrepancy list, the Company page shows it, and the memo
  prompt includes a warning so the analyst narrative can mention data quality.
  Nothing is silently discarded.
- **Derived fields are exempt:** EBITDA, ratios, and market data are never
  overridden by EDGAR (EDGAR doesn't define them the same way or at all).

## 4. Reliability tagging

Every canonical value carries a `ReliabilityFlag`:

| Flag | Meaning |
|---|---|
| `REPORTED` | Taken from a provider as-reported (filing or vendor statement). |
| `DERIVED` | Computed by our Calc Engine from `REPORTED` inputs. |
| `PROXY` | A stand-in (e.g. ROIC with an assumed tax rate). Formula disclosed. |
| `STALE` | Older than the freshness threshold (quotes: 5 days). |
| `MISSING` | Unavailable after all providers and fills. |

Reconciliation never upgrades reliability; a value that won a >2% dispute is
still `REPORTED`, but the dispute itself is visible.

## 5. Test obligations

`src/lib/data/reconcile.test.ts` must cover, at minimum: fill from EDGAR,
≤2% agreement (FMP stands, no discrepancy row), >2% disagreement (EDGAR wins,
discrepancy recorded), fiscal-year matching with drifting end dates, and
derived-field exemption. `edgar.normalize.test.ts` must cover the annual
duration window (rejecting quarterly spans), latest-filed-wins restatement
behavior, and non-calendar FYE extraction.
