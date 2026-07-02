"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Input,
  Badge,
  Muted,
} from "@/components/ui/primitives";
import { Metric, FlagBadge } from "@/components/reliability";
import { formatMetric, formatMoney } from "@/lib/utils";
import type { FinancialPacket } from "@/lib/calc/types";

export function CompanyClient() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packet, setPacket] = useState<FinancialPacket | null>(null);
  const [providers, setProviders] = useState<string[]>([]);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError(null);
    setPacket(null);
    try {
      const res = await fetch(`/api/company/${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Request failed.");
        setProviders(json.activeProviders ?? []);
      } else {
        setPacket(json.packet);
        setProviders(json.activeProviders ?? []);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="flex gap-2">
        <Input
          placeholder="Enter a ticker (e.g. AAPL, NVDA, MSFT)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Analyze"}
        </Button>
      </form>

      {error && (
        <Card className="border-[var(--negative)]/40">
          <p className="text-sm text-[var(--negative)]">{error}</p>
          {providers.length === 0 && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Tip: enable a data provider in Settings first.
            </p>
          )}
        </Card>
      )}

      {packet && <PacketView packet={packet} providers={providers} />}
    </div>
  );
}

function PacketView({
  packet,
  providers,
}: {
  packet: FinancialPacket;
  providers: string[];
}) {
  const m = packet.metrics;
  const v = packet.valuation;
  const rdcf = packet.reverseDcf;
  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{packet.profile.name}</h2>
              <Badge tone="accent">{packet.ticker}</Badge>
            </div>
            <Muted className="text-xs">
              {[packet.profile.exchange, packet.profile.sector, packet.profile.industry]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Muted>
          </div>
          <div className="flex items-center gap-6">
            <Metric label="Price" mv={packet.quote.price} />
            <Metric label="Market Cap" mv={packet.quote.marketCap} />
            <Metric label="Enterprise Value" mv={packet.quote.enterpriseValue} />
            <Metric label="Realized vol 1y" mv={m.realizedVol1yPct} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CompletenessBadge packet={packet} />
          {providers.map((p) => (
            <Badge key={p}>src: {p}</Badge>
          ))}
        </div>
      </Card>

      {packet.warnings.length > 0 && (
        <Card className="border-[var(--warning)]/40">
          <CardTitle className="text-[var(--warning)]">Data caveats</CardTitle>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            {packet.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Provider disagreements — surfaced, never discarded */}
      {packet.discrepancies.length > 0 && (
        <Card className="border-[var(--warning)]/40">
          <CardTitle>
            Provider disagreements ({">"}2% — EDGAR value used)
          </CardTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 pr-4">Field</th>
                  <th className="py-1 pr-4">Period</th>
                  <th className="py-1 pr-4">EDGAR (used)</th>
                  <th className="py-1 pr-4">FMP (retained)</th>
                  <th className="py-1 pr-4">Δ</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {packet.discrepancies.map((d, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-4">{d.field}</td>
                    <td className="py-1 pr-4">{d.fiscalDate.slice(0, 10)}</td>
                    <td className="py-1 pr-4">{formatMoney(d.chosenValue)}</td>
                    <td className="py-1 pr-4">{formatMoney(d.otherValue)}</td>
                    <td className="py-1 pr-4">{d.pctDiff}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Financial summary */}
      <Card>
        <CardTitle>Financial Summary (latest FY)</CardTitle>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <Metric label="Rev growth (YoY)" mv={m.revenueYoY} />
          <Metric label="Rev CAGR 3y" mv={m.revenueCagr3y} />
          <Metric label="Rev CAGR 5y" mv={m.revenueCagr5y} />
          <Metric label="Gross margin" mv={m.grossMargin} />
          <Metric label="Operating margin" mv={m.opMargin} />
          <Metric label="EBITDA margin" mv={m.ebitdaMargin} />
          <Metric label="Net margin" mv={m.netMargin} />
          <Metric label="FCF margin" mv={m.fcfMargin} />
          <Metric label="FCF" mv={m.fcf} />
          <Metric label="Capex / Revenue" mv={m.capexToRevenue} />
          <Metric label="ROIC" mv={m.roic} />
          <Metric label="ROE" mv={m.roe} />
          <Metric label="Net debt" mv={m.netDebt} />
          <Metric label="Net debt / EBITDA" mv={m.netDebtToEbitda} />
          <Metric label="Share count Δ3y" mv={m.shareCountChange3y} />
        </div>
      </Card>

      {/* Valuation + implied expectations */}
      <Card>
        <CardTitle>Valuation</CardTitle>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="P/E" mv={v.pe} />
          <Metric label="EV/EBITDA" mv={v.evEbitda} />
          <Metric label="EV/Sales" mv={v.evSales} />
          <Metric label="P/FCF" mv={v.pFcf} />
        </div>

        <div className="mt-5 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              What is priced in (reverse DCF — computed)
            </span>
            <FlagBadge flag={rdcf.reliability} />
          </div>
          {rdcf.result ? (
            <div className="mt-2">
              <span className="font-mono text-lg">
                {rdcf.result.impliedFcfCagrPct}%/yr
              </span>
              <Muted className="ml-2 text-xs">
                implied FCF growth over {rdcf.result.inputs.horizonYears}y ·
                inputs: FCF₀ {formatMoney(rdcf.result.inputs.fcf0)}, mkt cap{" "}
                {formatMoney(rdcf.result.inputs.marketCap)}, discount{" "}
                {rdcf.result.inputs.discountRatePct}%, terminal{" "}
                {rdcf.result.inputs.terminalGrowthPct}% perpetuity
              </Muted>
            </div>
          ) : (
            <Muted className="mt-2 block text-sm">{rdcf.note}</Muted>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Historical multiple range (current percentile = how expensive vs own
            history)
          </p>
          <MultipleRow label="P/E" r={packet.multipleHistory.pe} />
          <MultipleRow label="EV/EBITDA" r={packet.multipleHistory.evEbitda} />
          <MultipleRow label="EV/Sales" r={packet.multipleHistory.evSales} />
        </div>
      </Card>

      {/* Trend table */}
      {packet.periods.length > 0 && (
        <Card>
          <CardTitle>Historical Trend</CardTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 pr-4">Fiscal</th>
                  <th className="py-1 pr-4">Revenue</th>
                  <th className="py-1 pr-4">Gross %</th>
                  <th className="py-1 pr-4">Op %</th>
                  <th className="py-1 pr-4">Net %</th>
                  <th className="py-1 pr-4">FCF %</th>
                  <th className="py-1 pr-4">FCF</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {packet.periods.slice(0, 6).map((p) => (
                  <tr key={p.fiscalDate} className="border-t">
                    <td className="py-1 pr-4">{p.fiscalDate.slice(0, 10)}</td>
                    <td className="py-1 pr-4">{formatMetric(p.revenue.value, "$")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.grossMargin.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.opMargin.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.netMargin.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.fcfMargin.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.fcf.value, "$")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Peers */}
      {packet.peers.length > 0 && (
        <Card>
          <CardTitle>Peer Comparison</CardTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 pr-4">Ticker</th>
                  <th className="py-1 pr-4">P/E</th>
                  <th className="py-1 pr-4">EV/EBITDA</th>
                  <th className="py-1 pr-4">EV/Sales</th>
                  <th className="py-1 pr-4">Gross %</th>
                  <th className="py-1 pr-4">Op %</th>
                  <th className="py-1 pr-4">ROIC</th>
                  <th className="py-1 pr-4">Rev CAGR 3y</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t bg-[var(--surface-2)]">
                  <td className="py-1 pr-4 font-semibold">{packet.ticker}</td>
                  <td className="py-1 pr-4">{formatMetric(v.pe.value, "x")}</td>
                  <td className="py-1 pr-4">{formatMetric(v.evEbitda.value, "x")}</td>
                  <td className="py-1 pr-4">{formatMetric(v.evSales.value, "x")}</td>
                  <td className="py-1 pr-4">{formatMetric(m.grossMargin.value, "%")}</td>
                  <td className="py-1 pr-4">{formatMetric(m.opMargin.value, "%")}</td>
                  <td className="py-1 pr-4">{formatMetric(m.roic.value, "%")}</td>
                  <td className="py-1 pr-4">{formatMetric(m.revenueCagr3y.value, "%")}</td>
                </tr>
                {packet.peers.map((p) => (
                  <tr key={p.ticker} className="border-t">
                    <td className="py-1 pr-4">{p.ticker}</td>
                    <td className="py-1 pr-4">{formatMetric(p.pe.value, "x")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.evEbitda.value, "x")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.evSales.value, "x")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.grossMargin.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.opMargin.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.roic.value, "%")}</td>
                    <td className="py-1 pr-4">{formatMetric(p.revenueCagr3y.value, "%")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CompletenessBadge({ packet }: { packet: FinancialPacket }) {
  const c = packet.completeness;
  const tone =
    c.level === "HIGH" ? "positive" : c.level === "MEDIUM" ? "warning" : "negative";
  return (
    <Badge tone={tone}>
      data completeness: {c.level.toLowerCase()} ({c.populated}/{c.total})
    </Badge>
  );
}

function MultipleRow({
  label,
  r,
}: {
  label: string;
  r: FinancialPacket["multipleHistory"]["pe"];
}) {
  if (r.reliability === "MISSING") {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="w-20 text-[var(--muted)]">{label}</span>
        <FlagBadge flag="MISSING" />
        <Muted className="text-xs">no history</Muted>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-[var(--muted)]">{label}</span>
      <span className="font-mono">
        {formatMetric(r.min, "x")} – {formatMetric(r.max, "x")}
      </span>
      <Muted className="text-xs">median {formatMetric(r.median, "x")}</Muted>
      <span className="font-mono">now {formatMetric(r.current, "x")}</span>
      {r.percentile !== null && (
        <Badge
          tone={
            r.percentile >= 75
              ? "negative"
              : r.percentile <= 25
                ? "positive"
                : "default"
          }
        >
          {r.percentile.toFixed(0)}th pct
        </Badge>
      )}
    </div>
  );
}
