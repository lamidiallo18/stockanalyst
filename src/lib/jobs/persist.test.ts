// Integration test: persist a generated memo and read it back through the same
// query shape the API uses, validating the schema columns (incl. cost actuals
// and clamp/comparative flags) + JSON round-trips. Runs against the local dev
// SQLite DB and cleans up after itself.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { runMemoPipeline, type PipelineLLM } from "@/lib/memo/pipeline";
import { mockPlugin } from "@/lib/plugins/llm/mock";
import { fixturePacket } from "@/lib/test-fixtures";

const mock = mockPlugin.create({});
const fakeLLM: PipelineLLM = {
  providerKey: "mock",
  complete: (req) => mock.complete(req),
  costUsd: () => 0.005,
};

let analysisId: string;

describe("memo persistence round-trip", () => {
  it("persists and reads back a memo with cost + flag fields intact", async () => {
    const draft = await runMemoPipeline(
      fakeLLM,
      fixturePacket(),
      "test thesis",
      "STANDARD",
      { maxSingleNamePct: 8, targetVolPct: 25 },
    );

    const analysis = await prisma.analysis.create({
      data: {
        type: "STOCK",
        subjectRef: "ZTEST",
        title: "ZTEST",
        depth: "STANDARD",
        status: "COMPLETE",
      },
    });
    analysisId = analysis.id;

    await prisma.memo.create({
      data: {
        analysisId,
        version: 1,
        rating: draft.rating,
        confidence: draft.confidence,
        timeHorizon: draft.timeHorizon,
        positionSizeLow: draft.sizing.lowPct,
        positionSizeHigh: draft.sizing.highPct,
        sizingRationale: draft.sizing.rationale,
        modelUsed: draft.modelUsed,
        providerKey: draft.providerKey,
        compositeScore: draft.composite,
        totalUnverified: draft.totalUnverified,
        estimatedCostUsd: 0.03,
        actualCostUsd: draft.actualCostUsd,
        inputTokens: draft.inputTokens,
        outputTokens: draft.outputTokens,
        markdownCache: draft.markdown,
        sections: {
          create: draft.sections.map((s) => ({
            key: s.key,
            ordering: s.ordering,
            contentMd: s.contentMd,
            auditJson: JSON.stringify(s.unverifiedFigures),
          })),
        },
        scores: {
          create: draft.scores.map((s) => ({
            category: s.category,
            value: s.value,
            letter: s.letter,
            rationaleMd: s.rationaleMd,
            dataCompleteness: s.dataCompleteness,
            evidenceJson: JSON.stringify(s.evidence),
            signalsJson: JSON.stringify(s.signals),
            needsQualitative: s.needsQualitative,
            clamped: s.clamped,
            comparative: s.comparative,
          })),
        },
      },
    });

    const read = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        memos: {
          orderBy: { version: "desc" },
          take: 1,
          include: { sections: { orderBy: { ordering: "asc" } }, scores: true },
        },
      },
    });

    const memo = read!.memos[0];
    expect(memo.providerKey).toBe("mock");
    expect(memo.actualCostUsd).toBe(draft.actualCostUsd);
    expect(memo.estimatedCostUsd).toBe(0.03);
    expect(memo.inputTokens).toBeGreaterThan(0);
    expect(memo.positionSizeHigh).toBeLessThanOrEqual(8);
    expect(memo.sections).toHaveLength(12);
    expect(memo.scores).toHaveLength(9);
    expect(typeof memo.scores[0].clamped).toBe("boolean");
    expect(typeof memo.scores[0].comparative).toBe("boolean");
    expect(JSON.parse(memo.scores[0].signalsJson)).toBeInstanceOf(Array);
    expect(JSON.parse(memo.sections[0].auditJson)).toBeInstanceOf(Array);
  });
});

afterAll(async () => {
  if (analysisId)
    await prisma.analysis.delete({ where: { id: analysisId } }).catch(() => {});
  await prisma.$disconnect();
});
