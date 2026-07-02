// UI helpers for surfacing data reliability — the app's promise that you always
// know when a number is reported, derived, a proxy, stale, or missing.
import { Badge } from "@/components/ui/primitives";
import { formatMetric } from "@/lib/utils";

type Flag = "REPORTED" | "DERIVED" | "PROXY" | "STALE" | "MISSING";

const flagTone: Record<
  Flag,
  "default" | "positive" | "negative" | "warning" | "accent"
> = {
  REPORTED: "positive",
  DERIVED: "accent",
  PROXY: "warning",
  STALE: "warning",
  MISSING: "negative",
};

const flagLabel: Record<Flag, string> = {
  REPORTED: "reported",
  DERIVED: "derived",
  PROXY: "proxy",
  STALE: "stale",
  MISSING: "missing",
};

export function ReliabilityDot({ flag }: { flag: string }) {
  const f = (flag as Flag) ?? "MISSING";
  const color =
    f === "REPORTED"
      ? "var(--positive)"
      : f === "DERIVED"
        ? "var(--accent)"
        : f === "MISSING"
          ? "var(--negative)"
          : "var(--warning)";
  return (
    <span
      title={flagLabel[f] ?? "unknown"}
      className="inline-block h-1.5 w-1.5 rounded-full align-middle"
      style={{ background: color }}
    />
  );
}

export function FlagBadge({ flag }: { flag: string }) {
  const f = (flag as Flag) ?? "MISSING";
  return <Badge tone={flagTone[f] ?? "default"}>{flagLabel[f] ?? flag}</Badge>;
}

interface MV {
  value: number | null;
  reliability: string;
  unit?: string;
  note?: string;
}

// A labeled metric with its value and a reliability dot. The dot's title
// attribute explains the flag on hover; `note` (e.g. proxy formula) too.
export function Metric({ label, mv }: { label: string; mv: MV }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      <span
        className="flex items-center gap-1.5 font-mono text-sm"
        title={mv.note}
      >
        <ReliabilityDot flag={mv.reliability} />
        {formatMetric(mv.value, mv.unit)}
      </span>
    </div>
  );
}
