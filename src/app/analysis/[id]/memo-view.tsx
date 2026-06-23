"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Card,
  CardTitle,
  Badge,
  Button,
  Muted,
} from "@/components/ui/primitives";

interface Score {
  category: string;
  value: number;
  letter: string;
  rationaleMd: string | null;
  dataCompleteness: string;
  evidence: { claim: string; sourceType: string; ref?: string }[];
  signals: { label: string; value: string; contribution: number }[];
  needsQualitative: boolean;
}
interface Section {
  key: string;
  ordering: number;
  contentMd: string;
  unverifiedFigures: string[];
  citations: { locator: string | null; quote: string | null }[];
}
interface Memo {
  rating: string | null;
  confidence: string | null;
  positionSizeLow: number | null;
  positionSizeHigh: number | null;
  timeHorizon: string | null;
  modelUsed: string | null;
  providerKey: string | null;
  compositeScore: number | null;
  totalUnverified: number;
  markdown: string | null;
  sections: Section[];
  scores: Score[];
}
interface Data {
  analysis: { subjectRef: string; title: string; status: string; thesis: string };
  memo: Memo | null;
}

const TITLES: Record<string, string> = {
  executive_summary: "Executive Summary",
  user_thesis: "User Thesis",
  business_overview: "Business Overview",
  industry_context: "Industry / Theme Context",
  moat_analysis: "Moat Analysis",
  financial_analysis: "Financial Analysis",
  valuation: "Valuation",
  catalysts: "Catalysts",
  risks: "Risks and Challenges",
  disconfirming_evidence: "Disconfirming Evidence",
  portfolio_fit: "Portfolio Fit",
  final_recommendation: "Final Recommendation",
};

const ratingTone: Record<string, "positive" | "negative" | "warning" | "default"> = {
  ATTRACTIVE: "positive",
  WATCHLIST: "warning",
  AVOID: "negative",
  TOO_HARD: "default",
  NEEDS_WORK: "warning",
};

export function MemoView({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/analysis/${id}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => setError("Failed to load."));
  }, [id]);

  if (error) return <Card className="border-[var(--negative)]/40"><p className="text-sm text-[var(--negative)]">{error}</p></Card>;
  if (!data) return <Muted>Loading memo…</Muted>;
  if (!data.memo) return <Card><p className="text-sm">No memo generated yet (status: {data.analysis.status}).</p></Card>;

  const m = data.memo;

  function exportMd() {
    if (!m.markdown) return;
    const blob = new Blob([m.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memo-${data!.analysis.subjectRef}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Verdict header */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{data.analysis.subjectRef}</h2>
            {m.rating && <Badge tone={ratingTone[m.rating] ?? "default"}>{m.rating}</Badge>}
            {m.confidence && <Badge>confidence: {m.confidence}</Badge>}
          </div>
          <Button variant="secondary" onClick={exportMd}>Export Markdown</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Suggested size" value={m.positionSizeLow != null ? `${m.positionSizeLow}–${m.positionSizeHigh}%` : "—"} />
          <Stat label="Composite" value={m.compositeScore != null ? `${m.compositeScore}/100` : "—"} />
          <Stat label="Horizon" value={m.timeHorizon ?? "—"} />
          <Stat label="Model" value={`${m.providerKey ?? "?"} / ${m.modelUsed ?? "?"}`} />
        </div>
        {m.providerKey === "mock" && (
          <p className="mt-3 rounded-md bg-[var(--warning)]/15 px-3 py-2 text-xs text-[var(--warning)]">
            Generated with the Mock provider — narrative is placeholder. Numbers
            and scores are real. Connect Anthropic/OpenAI in Settings for genuine analysis.
          </p>
        )}
        {m.totalUnverified > 0 && (
          <p className="mt-2 text-xs text-[var(--warning)]">
            ⚠ {m.totalUnverified} figure(s) across the memo could not be traced to the data packet — see flags below.
          </p>
        )}
      </Card>

      {/* Sections */}
      {m.sections.map((s) => (
        <Card key={s.key}>
          <CardTitle>{TITLES[s.key] ?? s.key}</CardTitle>
          <div className="prose-memo mt-2 text-sm leading-relaxed">
            <ReactMarkdown>{s.contentMd}</ReactMarkdown>
          </div>
          {s.unverifiedFigures.length > 0 && (
            <p className="mt-2 rounded-md bg-[var(--warning)]/15 px-3 py-1.5 text-xs text-[var(--warning)]">
              ⚠ Unverified figures: {s.unverifiedFigures.join(", ")}
            </p>
          )}
          {s.citations.length > 0 && (
            <div className="mt-2 border-t pt-2">
              <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                Sources
              </span>
              <ul className="mt-1 space-y-0.5">
                {s.citations.map((c, i) => (
                  <li key={i} className="text-xs text-[var(--accent)]">
                    ❏ {c.locator ?? "uploaded source"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}

      {/* Scorecard */}
      <Card>
        <CardTitle>Scorecard (transparent, evidence-backed)</CardTitle>
        <div className="mt-3 space-y-3">
          {m.scores.map((s) => (
            <div key={s.category} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">
                  {s.category.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-2">
                  {s.needsQualitative && <Badge>qualitative</Badge>}
                  <Badge tone={s.dataCompleteness === "HIGH" ? "positive" : s.dataCompleteness === "MEDIUM" ? "warning" : "negative"}>
                    {s.dataCompleteness.toLowerCase()} data
                  </Badge>
                  <span className="font-mono text-sm">{s.value}/100 ({s.letter})</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${s.value}%` }} />
              </div>
              {s.rationaleMd && (
                <div className="prose-memo mt-2 text-xs text-[var(--muted)]">
                  <ReactMarkdown>{s.rationaleMd}</ReactMarkdown>
                </div>
              )}
              {s.signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.signals.map((sig, i) => (
                    <span key={i} className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      {sig.label}: {sig.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
