// Renders the Financial Packet into a compact, labeled text block for LLM
// prompts, and extracts the set of "known" numeric facts used by the grounding
// audit. The LLM is told these are the ONLY quantitative facts it may state.
import type { FinancialPacket, MetricValue } from "@/lib/calc/types";
import { formatMetric } from "@/lib/utils";

function line(id: string, m: MetricValue): string {
  return `- ${id} = ${formatMetric(m.value, m.unit)} [${m.reliability}]`;
}

export function renderPacketContext(p: FinancialPacket): string {
  const m = p.metrics;
  const v = p.valuation;
  const out: string[] = [];
  out.push(`COMPANY: ${p.profile.name} (${p.ticker})`);
  out.push(
    `Sector: ${p.profile.sector ?? "—"} | Industry: ${p.profile.industry ?? "—"} | Exchange: ${p.profile.exchange ?? "—"}`,
  );
  if (p.profile.description) out.push(`Description: ${p.profile.description.slice(0, 600)}`);
  out.push("");
  out.push("MARKET:");
  out.push(line("quote.price", p.quote.price));
  out.push(line("quote.marketCap", p.quote.marketCap));
  out.push(line("quote.enterpriseValue", p.quote.enterpriseValue));
  out.push("");
  out.push("GROWTH:");
  out.push(line("metrics.revenueYoY", m.revenueYoY));
  out.push(line("metrics.revenueCagr3y", m.revenueCagr3y));
  out.push(line("metrics.revenueCagr5y", m.revenueCagr5y));
  out.push("");
  out.push("MARGINS & RETURNS:");
  out.push(line("metrics.grossMargin", m.grossMargin));
  out.push(line("metrics.opMargin", m.opMargin));
  out.push(line("metrics.ebitdaMargin", m.ebitdaMargin));
  out.push(line("metrics.netMargin", m.netMargin));
  out.push(line("metrics.fcfMargin", m.fcfMargin));
  out.push(line("metrics.fcf", m.fcf));
  out.push(line("metrics.capexToRevenue", m.capexToRevenue));
  out.push(line("metrics.roic", m.roic));
  out.push(line("metrics.roe", m.roe));
  out.push("");
  out.push("BALANCE SHEET:");
  out.push(line("metrics.netDebt", m.netDebt));
  out.push(line("metrics.netDebtToEbitda", m.netDebtToEbitda));
  out.push(line("metrics.shareCountChange3y", m.shareCountChange3y));
  out.push("");
  out.push("VALUATION (current):");
  out.push(line("valuation.pe", v.pe));
  out.push(line("valuation.evEbitda", v.evEbitda));
  out.push(line("valuation.evSales", v.evSales));
  out.push(line("valuation.pFcf", v.pFcf));
  out.push("");
  out.push("VALUATION (history range / current percentile):");
  for (const [k, r] of Object.entries(p.multipleHistory)) {
    if (r.reliability === "MISSING") {
      out.push(`- ${k}: no history available`);
    } else {
      out.push(
        `- ${k}: min ${r.min}× / median ${r.median}× / max ${r.max}× | current ${r.current}× = ${r.percentile}th percentile`,
      );
    }
  }
  if (p.peers.length) {
    out.push("");
    out.push("PEERS (ticker | P/E | EV/EBITDA | EV/Sales | gross% | op% | rev CAGR3y):");
    for (const peer of p.peers) {
      out.push(
        `- ${peer.ticker} | ${formatMetric(peer.pe.value, "x")} | ${formatMetric(peer.evEbitda.value, "x")} | ${formatMetric(peer.evSales.value, "x")} | ${formatMetric(peer.grossMargin.value, "%")} | ${formatMetric(peer.opMargin.value, "%")} | ${formatMetric(peer.revenueCagr3y.value, "%")}`,
      );
    }
  }
  out.push("");
  out.push(
    `DATA COMPLETENESS: ${p.completeness.level} (${p.completeness.populated}/${p.completeness.total}). Missing: ${p.completeness.missing.join(", ") || "none"}.`,
  );
  if (p.warnings.length) out.push(`WARNINGS: ${p.warnings.join(" | ")}`);
  return out.join("\n");
}

// All numeric strings that appear in the packet, in the formats the model is
// likely to reproduce. Used by the audit to detect invented figures.
export function collectKnownNumbers(p: FinancialPacket): Set<string> {
  const known = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return;
    const abs = Math.abs(n);
    // Several rounded representations the model might use.
    known.add(String(n));
    known.add(String(Math.round(n)));
    known.add(abs.toFixed(1));
    known.add(abs.toFixed(2));
    known.add(Math.round(abs).toString());
    // Money in compact units.
    for (const [div, suf] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
      if (abs >= div) known.add((abs / div).toFixed(2) + suf);
      if (abs >= div) known.add((abs / div).toFixed(1) + suf);
    }
  };
  const walk = (mv: MetricValue) => add(mv.value);
  const m = p.metrics, v = p.valuation;
  [m.revenueYoY, m.revenueCagr3y, m.revenueCagr5y, m.grossMargin, m.opMargin,
   m.ebitdaMargin, m.netMargin, m.fcfMargin, m.fcf, m.capexToRevenue, m.roic,
   m.roe, m.netDebt, m.netDebtToEbitda, m.shareCountChange3y,
   v.pe, v.evEbitda, v.evSales, v.pFcf,
   p.quote.price, p.quote.marketCap, p.quote.enterpriseValue].forEach(walk);
  for (const r of Object.values(p.multipleHistory)) {
    add(r.min); add(r.median); add(r.max); add(r.current); add(r.percentile);
  }
  for (const peer of p.peers) {
    [peer.pe, peer.evEbitda, peer.evSales, peer.grossMargin, peer.opMargin, peer.revenueCagr3y].forEach(walk);
  }
  for (const per of p.periods) {
    add(per.revenue.value); add(per.fcf.value);
    [per.grossMargin, per.opMargin, per.netMargin, per.fcfMargin].forEach(walk);
  }
  return known;
}
