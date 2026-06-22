// GET /api/jobs/[id] -> job status for polling progress.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    analysisId: job.analysisId,
    status: job.status,
    progressPct: job.progressPct,
    currentStep: job.currentStep,
    error: job.error,
  });
}
