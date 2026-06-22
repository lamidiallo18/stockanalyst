// Integration test: persist a generated memo and read it back through the same
// query shape the API uses, validating the schema columns + JSON round-trips.
// Runs against the local dev SQLite DB and cleans up after itself.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { runMemoPipeline, type PipelineLLM } from "@/lib/memo/pipeline";
import { mockPlugin } from "@/lib/plugins/llm/mock";
import { computePacket } from "@/lib/calc/engine";
import type { NormalizedPeriod } from "@/lib/plugins/types";

function fy(date: string, over: Partial<NormalizedPeriod>): NormalizedPeriod {
  return { periodType: "FY", fiscalDate: date, ...over };
}

const packet = computePacket({
  profile: { ticker: "ZTEST", name: "Ztest Corp" },
  quote: { ticker: "ZTEST", asOf: "2024-01-01T00:00:00Z", price: 50, marketCap: 5000 },
  financials: {
    ticker: "ZTEST",
    periods: [
      fy("2023-12-31", { revenue: 1000, grossProfit: 600, opIncome: 300, ebitda: 350, netIncome: 200, ocf: 280, capex: 80, totalDebt: 400, cash: 100, totalEquity: 500, shares: 100 }),
      fy("2020-12-31", { revenue: 500, shares: 110 }),
    ],
  },
  now: new Date("2024-01-02T00:00:00Z"),
});

const mock = mockPlugin.create({});
const fakeLLM: PipelineLLM = { providerKey: "mock", complete: (req) => mock.complete(req) };

let analysisId: string;

describe("memo persistence round-trip", () => {
  it("persists and reads back a memo with new fields intact", async () => {
    const draft = await runMemoPipeline(fakeLLM, packet, "test thesis");

    const analysis = await prisma.analysis.create({
      data: { type: "STOCK", subjectRef: "ZTEST", title: "ZTEST", status: "COMPLETE" },
    });
    analysisId = analysis.id;

    await prisma.memo.create({
      data: {
        analysisId,
        version: 1,
        rating: draft.rating,
        confidence: draft.confidence,
        positionSizeLow: draft.positionSizeLow,
        positionSizeHigh: draft.positionSizeHigh,
        timeHorizon: draft.timeHorizon,
        modelUsed: draft.modelUsed,
        providerKey: draft.providerKey,
        compositeScore: draft.composite,
        totalUnverified: draft.totalUnverified,
        markdownCache: draft.markdown,
        sections: { create: draft.sections.map((s) => ({ key: s.key, ordering: s.ordering, contentMd: s.contentMd, auditJson: JSON.stringify(s.unverifiedFigures) })) },
        scores: { create: draft.scores.map((s) => ({ category: s.category, value: s.value, letter: s.letter, rationaleMd: s.rationaleMd, dataCompleteness: s.dataCompleteness, evidenceJson: JSON.stringify(s.evidence), signalsJson: JSON.stringify(s.signals), needsQualitative: s.needsQualitative })) },
      },
    });

    const read = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        memos: { orderBy: { version: "desc" }, take: 1, include: { sections: { orderBy: { ordering: "asc" } }, scores: true } },
      },
    });

    const memo = read!.memos[0];
    expect(memo.providerKey).toBe("mock");
    expect(memo.compositeScore).toBe(draft.composite);
    expect(memo.sections).toHaveLength(12);
    expect(memo.scores).toHaveLength(10);
    // JSON columns parse back to arrays
    expect(JSON.parse(memo.scores[0].signalsJson)).toBeInstanceOf(Array);
    expect(JSON.parse(memo.sections[0].auditJson)).toBeInstanceOf(Array);
  });
});

afterAll(async () => {
  if (analysisId) await prisma.analysis.delete({ where: { id: analysisId } }).catch(() => {});
  await prisma.$disconnect();
});
