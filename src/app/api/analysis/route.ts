// POST /api/analysis -> start a new analysis job. Returns { analysisId, jobId }.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startAnalysis } from "@/lib/jobs/analysis";

export const dynamic = "force-dynamic";

const schema = z.object({
  subjectRef: z.string().min(1).max(12),
  thesis: z.string().min(1).max(8000),
  depth: z.enum(["QUICK", "STANDARD", "DEEP"]).optional(),
  type: z.enum(["STOCK", "SECTOR_THEME", "ETF", "PORTFOLIO_IMPACT"]).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const result = await startAnalysis(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start analysis." },
      { status: 500 },
    );
  }
}
