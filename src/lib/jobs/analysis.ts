// Analysis job runner. Creates the Analysis/Thesis/Job records (with the
// pre-run cost estimate on the Job), then runs the data + memo pipeline in the
// background, streaming progress into the Job row (which the UI polls).
// Actual token usage and USD cost land on the Memo. Kept in-process: correct
// and simple for a local, single-user app.
import "server-only";
import { prisma } from "@/lib/db";
import { DataService } from "@/lib/data/service";
import { LLMService } from "@/lib/llm/service";
import { estimateCost } from "@/lib/llm/cost";
import { getSetting } from "@/lib/app-settings";
import { runMemoPipeline, type MemoDraft } from "@/lib/memo/pipeline";
import { AnalysisStatus, AnalysisType, type AnalysisDepth } from "@/lib/enums";

// Holds references to in-flight job promises so they aren't garbage-collected.
const inFlight = new Set<Promise<unknown>>();

export interface StartAnalysisInput {
  subjectRef: string; // ticker
  thesis: string;
  depth: AnalysisDepth;
}

export async function startAnalysis(
  input: StartAnalysisInput,
): Promise<{ analysisId: string; jobId: string; estimatedCostUsd: number | null }> {
  const ticker = input.subjectRef.trim().toUpperCase();

  // Pre-run cost estimate (amendment 7), shown in the job UI.
  const llmForEstimate = await LLMService.create();
  const estimate = llmForEstimate
    ? estimateCost(llmForEstimate, input.depth).totalUsd
    : null;

  const analysis = await prisma.analysis.create({
    data: {
      type: AnalysisType.STOCK,
      subjectRef: ticker,
      title: ticker,
      depth: input.depth,
      status: AnalysisStatus.RUNNING,
      thesis: { create: { userThesisText: input.thesis } },
    },
  });
  const job = await prisma.job.create({
    data: {
      type: "ANALYSIS_MEMO",
      analysisId: analysis.id,
      status: "RUNNING",
      currentStep: "Queued",
      estimatedCostUsd: estimate,
    },
  });

  const p = runAnalysis(
    analysis.id, job.id, ticker, input.thesis, input.depth, estimate,
  ).finally(() => inFlight.delete(p));
  inFlight.add(p);

  return { analysisId: analysis.id, jobId: job.id, estimatedCostUsd: estimate };
}

async function setProgress(jobId: string, pct: number, step: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { progressPct: pct, currentStep: step },
  });
}

async function runAnalysis(
  analysisId: string,
  jobId: string,
  ticker: string,
  thesis: string,
  depth: AnalysisDepth,
  estimatedCostUsd: number | null,
) {
  try {
    await setProgress(jobId, 4, "Resolving providers");
    const data = await DataService.create();
    if (data.activeKeys.length === 0) {
      throw new Error("No data provider enabled. Configure one in Settings.");
    }
    const llm = await LLMService.create();
    if (!llm) {
      throw new Error(
        "No LLM provider enabled. Enable Anthropic, OpenAI, or the Mock provider in Settings.",
      );
    }

    await setProgress(jobId, 8, "Pulling & reconciling market/financial data");
    const packet = await data.buildPacket(ticker);
    if (packet.periods.length === 0 && !packet.quote.price.value) {
      throw new Error(`No data found for "${ticker}".`);
    }

    const sizingPolicy = await getSetting("sizingPolicy");

    const draft = await runMemoPipeline(
      llm,
      packet,
      thesis,
      depth,
      sizingPolicy,
      (pct, step) => setProgress(jobId, Math.max(8, pct), step),
    );

    await persistMemo(analysisId, draft, estimatedCostUsd);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: AnalysisStatus.COMPLETE },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "DONE", progressPct: 100, currentStep: "Complete" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed.";
    await prisma.analysis
      .update({ where: { id: analysisId }, data: { status: AnalysisStatus.ERROR } })
      .catch(() => {});
    await prisma.job
      .update({
        where: { id: jobId },
        data: { status: "ERROR", error: message, currentStep: "Error" },
      })
      .catch(() => {});
  }
}

async function persistMemo(
  analysisId: string,
  draft: MemoDraft,
  estimatedCostUsd: number | null,
) {
  const last = await prisma.memo.findFirst({
    where: { analysisId },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;

  await prisma.memo.create({
    data: {
      analysisId,
      version,
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
      estimatedCostUsd,
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
}
