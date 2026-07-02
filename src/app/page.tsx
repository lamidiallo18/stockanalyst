import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle, Muted, Badge, Button } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const ratingTone: Record<string, "positive" | "negative" | "warning" | "default"> = {
  ATTRACTIVE: "positive",
  WATCHLIST: "warning",
  AVOID: "negative",
  TOO_HARD: "default",
  NEEDS_WORK: "warning",
};

export default async function HomePage() {
  const analyses = await prisma.analysis.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    include: {
      memos: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  return (
    <div>
      <PageHeader
        title="Research Desk"
        subtitle="Recent analyses and memos."
        action={
          <Link href="/new-analysis">
            <Button>+ New Analysis</Button>
          </Link>
        }
      />

      <Card>
        <CardTitle>Recent Analyses</CardTitle>
        {analyses.length === 0 ? (
          <div className="mt-4 flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-[var(--muted)]">
            <span>No analyses yet.</span>
            <span>
              First: enable providers in{" "}
              <Link href="/settings" className="text-[var(--accent)]">
                Settings
              </Link>
              , then run one from{" "}
              <Link href="/new-analysis" className="text-[var(--accent)]">
                New Analysis
              </Link>
              .
            </span>
          </div>
        ) : (
          <div className="mt-3 divide-y">
            {analyses.map((a) => {
              const memo = a.memos[0];
              return (
                <Link
                  key={a.id}
                  href={a.status === "COMPLETE" ? `/analysis/${a.id}` : "#"}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-[var(--surface-2)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold">
                      {a.subjectRef}
                    </span>
                    <Badge>{a.depth.toLowerCase()}</Badge>
                    {a.status === "COMPLETE" && memo?.rating ? (
                      <Badge tone={ratingTone[memo.rating] ?? "default"}>
                        {memo.rating}
                      </Badge>
                    ) : (
                      <Badge tone={a.status === "ERROR" ? "negative" : "accent"}>
                        {a.status.toLowerCase()}
                      </Badge>
                    )}
                    {memo?.compositeScore != null && (
                      <Muted className="text-xs">
                        composite {memo.compositeScore}/100
                      </Muted>
                    )}
                  </div>
                  <Muted className="text-xs">
                    {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </Muted>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
