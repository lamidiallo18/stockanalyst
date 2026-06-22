import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardTitle,
  Muted,
  Badge,
  Button,
} from "@/components/ui/primitives";

// Home dashboard. Phase 0 shows the intended structure with empty states;
// live data wiring arrives in later phases.
export default function HomePage() {
  return (
    <div>
      <PageHeader
        title="Research Desk"
        subtitle="Portfolio health, open theses, and recent work at a glance."
        action={
          <Link href="/new-analysis">
            <Button>+ New Analysis</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>Portfolio Value</CardTitle>
          <div className="mt-2 text-2xl font-semibold">—</div>
          <Muted className="text-xs">
            No holdings yet · add them in Portfolio
          </Muted>
        </Card>
        <Card>
          <CardTitle>Concentration Alerts</CardTitle>
          <div className="mt-2 text-2xl font-semibold">0</div>
          <Muted className="text-xs">
            Single-name / sector / theme limits OK
          </Muted>
        </Card>
        <Card>
          <CardTitle>Theses Needing Review</CardTitle>
          <div className="mt-2 text-2xl font-semibold">0</div>
          <Muted className="text-xs">Stale checks & weakening status</Muted>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Analyses</CardTitle>
            <Badge tone="accent">Phase 2</Badge>
          </div>
          <div className="mt-4 flex h-28 items-center justify-center rounded-lg border border-dashed text-sm text-[var(--muted)]">
            Run your first memo from “New Analysis”.
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Watchlist</CardTitle>
            <Badge tone="accent">Phase 2</Badge>
          </div>
          <div className="mt-4 flex h-28 items-center justify-center rounded-lg border border-dashed text-sm text-[var(--muted)]">
            Tickers you flag will appear here.
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Getting started</CardTitle>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>
            Open{" "}
            <Link href="/settings" className="text-[var(--accent)]">
              Settings
            </Link>{" "}
            and add your FMP key and Anthropic key (stored encrypted, locally).
          </li>
          <li>Add your current holdings in Portfolio.</li>
          <li>
            Start a new analysis: enter a ticker or theme, write your thesis,
            attach files, pick a depth.
          </li>
        </ol>
      </Card>
    </div>
  );
}
