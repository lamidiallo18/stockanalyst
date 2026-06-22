// Grounding audit — the code-side guardrail behind the "numbers come from data,
// never from the LLM" contract. It scans generated prose for numeric claims and
// flags any figure that doesn't trace back to the Financial Packet, so the UI
// can mark unverified numbers rather than trusting them blindly.

// Matches percentages, multiples, money (with K/M/B/T), and bare decimals.
// Letter units (x/T/B/M/K/bn/bps) must be directly attached and NOT followed by
// another letter, so "2023 there" isn't read as "2023t" and "25x" still works.
const NUM_RE =
  /\$?\d[\d,]*(?:\.\d+)?(?:%|×|(?:x|T|B|M|K|bn|bps)(?![A-Za-z]))?/gi;

// Numbers we never flag: years, small list/section integers, and common ratios.
function isIgnorable(token: string, raw: number): boolean {
  // Years 1900-2099
  if (/^\d{4}$/.test(token) && raw >= 1900 && raw <= 2099) return true;
  // Small integers (list counts, "3 catalysts", "top 5")
  if (Number.isInteger(raw) && Math.abs(raw) <= 12) return true;
  return false;
}

function normalizeCandidates(token: string): string[] {
  const cleaned = token.replace(/[$,×x%\s]/gi, "");
  const out = [cleaned];
  const num = parseFloat(cleaned.replace(/[TBMK]/i, ""));
  if (Number.isFinite(num)) {
    out.push(String(num));
    out.push(String(Math.round(num)));
    out.push(Math.abs(num).toFixed(1));
    out.push(Math.abs(num).toFixed(2));
  }
  // Keep unit-suffixed compact forms (e.g., 3.05T) for matching.
  const unitMatch = cleaned.match(/^([\d.]+)([TBMK])$/i);
  if (unitMatch) out.push(unitMatch[1] + unitMatch[2].toUpperCase());
  return out;
}

export interface AuditResult {
  unverified: string[]; // distinct suspicious figures
  total: number; // total numeric tokens considered
}

export function auditText(text: string, known: Set<string>): AuditResult {
  const matches = text.match(NUM_RE) ?? [];
  const unverified = new Set<string>();
  let total = 0;
  for (const raw of matches) {
    const token = raw.trim();
    if (!token || !/\d/.test(token)) continue;
    const num = parseFloat(token.replace(/[$,×x%\s]/gi, "").replace(/[TBMK]/i, ""));
    if (!Number.isFinite(num)) continue;
    if (isIgnorable(token.replace(/[$,×x%\s]/gi, ""), num)) continue;
    total++;
    const candidates = normalizeCandidates(token);
    const matched = candidates.some((c) => known.has(c));
    if (!matched) unverified.add(token);
  }
  return { unverified: [...unverified], total };
}
