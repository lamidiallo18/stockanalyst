"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardTitle,
  Button,
  Input,
  Muted,
} from "@/components/ui/primitives";
import { formatUsd } from "@/lib/utils";

type Depth = "QUICK" | "STANDARD" | "DEEP";

interface Estimate {
  totalUsd: number;
  providerKey: string;
  perStage: { stage: string; model: string; estUsd: number }[];
}

export function NewAnalysisClient() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [thesis, setThesis] = useState("");
  const [depth, setDepth] = useState<Depth>("STANDARD");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [jobEstimate, setJobEstimate] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-run cost estimate per depth tier (amendment 7).
  useEffect(() => {
    let cancelled = false;
    setEstimate(null);
    setEstimateError(null);
    fetch(`/api/analysis/estimate?depth=${depth}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (ok) setEstimate(j.estimate);
        else setEstimateError(j.error ?? "Estimate unavailable.");
      })
      .catch(() => !cancelled && setEstimateError("Estimate unavailable."));
    return () => {
      cancelled = true;
    };
  }, [depth]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ticker.trim() || !thesis.trim()) {
      setError("Enter a ticker and a thesis.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectRef: ticker.trim(), thesis, depth }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to start.");
        setSubmitting(false);
        return;
      }
      setJobId(json.jobId);
      setAnalysisId(json.analysisId);
      setJobEstimate(json.estimatedCostUsd ?? null);
    } catch {
      setError("Network error.");
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();
        setProgress(job.progressPct ?? 0);
        setStep(job.currentStep ?? "");
        if (job.estimatedCostUsd != null) setJobEstimate(job.estimatedCostUsd);
        if (job.status === "DONE") {
          clearInterval(pollRef.current!);
          router.push(`/analysis/${analysisId}`);
        } else if (job.status === "ERROR") {
          clearInterval(pollRef.current!);
          setError(job.error ?? "Analysis failed.");
          setSubmitting(false);
          setJobId(null);
        }
      } catch {
        /* keep polling */
      }
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, analysisId, router]);

  if (jobId) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Running analysis…</CardTitle>
          {jobEstimate != null && (
            <Muted className="text-xs">
              est. cost {formatUsd(jobEstimate)}
            </Muted>
          )}
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {progress}% · {step}
        </p>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Stages: data + reconciliation → scores + sizing → thesis critique
          {depth !== "QUICK" ? " → bull → bear → disconfirming" : ""} → memo
          draft → figure audit.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <Card className="border-[var(--negative)]/40">
          <p className="text-sm text-[var(--negative)]">{error}</p>
        </Card>
      )}
      <Card>
        <CardTitle>Subject</CardTitle>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-[var(--muted)]">
            Ticker
          </label>
          <Input
            placeholder="e.g. AAPL"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="max-w-xs"
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Your Thesis</CardTitle>
        <textarea
          className="mt-3 w-full rounded-md border bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          rows={6}
          placeholder="In plain English: what's the bet, and why? The analyst will restate it, find hidden assumptions, and challenge it."
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
        />
      </Card>

      <Card>
        <CardTitle>Depth & estimated cost</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["QUICK", "STANDARD", "DEEP"] as Depth[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepth(d)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                depth === d
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {d === "QUICK"
                ? "Quick screen"
                : d === "STANDARD"
                  ? "Standard memo"
                  : "Deep memo"}
            </button>
          ))}
        </div>
        <div className="mt-3 text-sm">
          {estimate ? (
            <div>
              <span className="font-mono">
                ≈ {formatUsd(estimate.totalUsd)}
              </span>
              <Muted className="ml-2 text-xs">
                via {estimate.providerKey} ·{" "}
                {estimate.perStage
                  .map((s) => `${s.stage} (${s.model})`)
                  .join(" → ")}
              </Muted>
            </div>
          ) : (
            <Muted className="text-xs">
              {estimateError ?? "Estimating…"}
            </Muted>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Starting…" : "Run Analysis"}
        </Button>
      </div>
    </form>
  );
}
