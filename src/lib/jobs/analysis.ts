// Analysis job runner. Creates the Analysis/Thesis/Job records, then runs the
// data + memo pipeline in the background, streaming progress into the Job row
// (which the UI polls). Kept in-process: correct and simple for a local,
// single-user app — no external queue needed.
import "server-only";
import { prisma } from "@/lib/db";
import { DataService } from "@/lib/data/service";
import { LLMService } from "@/lib/llm/service";
import { runMemoPipeline, type MemoDraft } from "@/lib/memo/pipeline";
import { retrieveForAnalysis } from "@/lib/sources/service";
import { buildSourcesContext } from "@/lib/memo/sources-context";
import { getSetting } from "@/lib/app-settings";
import { AnalysisStatus, AnalysisType } from "@/lib/enums";

// Holds references to in-flight job promises so they aren't garbage-collected.
const inFlight = new Set<Promise<unknown>>();

export interface StartAnalysisInput {
  subjectRef: string; // ticker for STOCK
  thesis: string;
  depth?: string;
  type?: string;
  sourceIds?: string[]; // uploaded sources to attach to this analysis
}

export async function startAnalysis(
  input: StartAnalysisInput,
): Promise<{ analysisId: string; jobId: string }> {
  const ticker = input.subjectRef.trim().toUpperCase();
  const analysis = await prisma.analysis.create({
    data: {
      type: input.type ?? AnalysisType.STOCK,
      subjectRef: ticker,
      title: ticker,
      depth: input.depth ?? "STANDARD",
      status: AnalysisStatus.RUNNING,
      thesis: { create: { userThesisText: input.thesis } },
    },
  });

  // Attach any pre-uploaded sources to this analysis.
  if (input.sourceIds?.length) {
    await prisma.source.updateMany({
      where: { id: { in: input.sourceIds } },
      data: { analysisId: analysis.id },
    });
  }
  const job = await prisma.job.create({
    data: { type: "ANALYSIS_MEMO", analysisId: analysis.id, status: "RUNNING", currentStep: "Queued" },
  });

  // Fire-and-forget; progress is observable via the Job row.
  const p = runAnalysis(analysis.id, job.id, ticker, input.thesis).finally(() =>
    inFlight.delete(p),
  );
  inFlight.add(p);

  return { analysisId: analysis.id, jobId: job.id };
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
) {
  try {
    await setProgress(jobId, 4, "Resolving data providers");
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

    await setProgress(jobId, 8, "Pulling market & financial data");
    const packet = await data.buildPacket(ticker);
    if (packet.periods.length === 0 && !packet.quote.price.value) {
      throw new Error(`No data found for "${ticker}".`);
    }

    // Retrieve relevant excerpts from any attached uploaded sources (respecting
    // the privacy setting that controls sending source text to the LLM).
    const features = await getSetting("features");
    let sourcesContext = null;
    if (features.allowSourceExcerptsToLLM) {
      await setProgress(jobId, 14, "Retrieving relevant source excerpts");
      const query = `${packet.profile.name} ${ticker} ${thesis}`;
      const chunks = await retrieveForAnalysis(analysisId, query, 8);
      sourcesContext = buildSourcesContext(chunks);
    }

    const draft = await runMemoPipeline(
      llm,
      packet,
      thesis,
      (pct, step) => setProgress(jobId, Math.max(14, pct), step),
      sourcesContext,
    );

    await persistMemo(analysisId, draft, packet);

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
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: AnalysisStatus.ERROR },
    }).catch(() => {});
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "ERROR", error: message, currentStep: "Error" },
    }).catch(() => {});
  }
}

async function persistMemo(
  analysisId: string,
  draft: MemoDraft,
  packet: { ticker: string },
) {
  const last = await prisma.memo.findFirst({
    where: { analysisId },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;

  const memo = await prisma.memo.create({
    data: {
      analysisId,
      version,
      rating: draft.rating,
      positionSizeLow: draft.positionSizeLow,
      positionSizeHigh: draft.positionSizeHigh,
      confidence: draft.confidence,
      timeHorizon: draft.timeHorizon,
      modelUsed: draft.modelUsed,
      providerKey: draft.providerKey,
      compositeScore: draft.composite,
      totalUnverified: draft.totalUnverified,
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
        })),
      },
    },
    include: { sections: true },
  });

  // Link inline [S#] citations to their source chunks via the persisted
  // section ids.
  if (draft.citations.length) {
    const sectionIdByKey = new Map(memo.sections.map((s) => [s.key, s.id]));
    const rows = draft.citations
      .map((c) => {
        const memoSectionId = sectionIdByKey.get(c.sectionKey);
        if (!memoSectionId) return null;
        return {
          memoSectionId,
          sourceChunkId: c.chunkId,
          locator: c.filename
            ? `${c.filename}${c.page ? ` p.${c.page}` : ""}`
            : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) await prisma.citation.createMany({ data: rows });
  }
}
