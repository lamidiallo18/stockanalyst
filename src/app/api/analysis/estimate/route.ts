// GET /api/analysis/estimate?depth=STANDARD -> pre-run cost estimate for the
// enabled LLM provider at the requested depth tier (amendment 7).
import { NextRequest, NextResponse } from "next/server";
import { LLMService } from "@/lib/llm/service";
import { estimateCost } from "@/lib/llm/cost";
import type { AnalysisDepth } from "@/lib/enums";

export const dynamic = "force-dynamic";

const DEPTHS = new Set(["QUICK", "STANDARD", "DEEP"]);

export async function GET(req: NextRequest) {
  const depth = (req.nextUrl.searchParams.get("depth") ?? "STANDARD").toUpperCase();
  if (!DEPTHS.has(depth)) {
    return NextResponse.json({ error: "Invalid depth." }, { status: 400 });
  }
  const llm = await LLMService.create();
  if (!llm) {
    return NextResponse.json(
      { error: "No LLM provider enabled. Enable one in Settings." },
      { status: 503 },
    );
  }
  return NextResponse.json({
    estimate: estimateCost(llm, depth as AnalysisDepth),
  });
}
