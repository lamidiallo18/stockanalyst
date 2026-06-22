// GET /api/analysis/[id] -> analysis with thesis and latest memo (sections +
// scores). Powers the memo view page.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: {
      thesis: true,
      memos: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          sections: { orderBy: { ordering: "asc" } },
          scores: true,
        },
      },
    },
  });
  if (!analysis)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memo = analysis.memos[0] ?? null;
  return NextResponse.json({
    analysis: {
      id: analysis.id,
      type: analysis.type,
      subjectRef: analysis.subjectRef,
      title: analysis.title,
      status: analysis.status,
      thesis: analysis.thesis?.userThesisText ?? "",
    },
    memo: memo
      ? {
          id: memo.id,
          version: memo.version,
          rating: memo.rating,
          confidence: memo.confidence,
          positionSizeLow: memo.positionSizeLow,
          positionSizeHigh: memo.positionSizeHigh,
          timeHorizon: memo.timeHorizon,
          modelUsed: memo.modelUsed,
          providerKey: memo.providerKey,
          compositeScore: memo.compositeScore,
          totalUnverified: memo.totalUnverified,
          markdown: memo.markdownCache,
          sections: memo.sections.map((s) => ({
            key: s.key,
            ordering: s.ordering,
            contentMd: s.contentMd,
            unverifiedFigures: JSON.parse(s.auditJson || "[]"),
          })),
          scores: memo.scores.map((s) => ({
            category: s.category,
            value: s.value,
            letter: s.letter,
            rationaleMd: s.rationaleMd,
            dataCompleteness: s.dataCompleteness,
            evidence: JSON.parse(s.evidenceJson || "[]"),
            signals: JSON.parse(s.signalsJson || "[]"),
            needsQualitative: s.needsQualitative,
          })),
        }
      : null,
  });
}
