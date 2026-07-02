// Memo pipeline — orchestrates the multi-stage LLM reasoning that turns a
// Financial Packet + user thesis into a grounded, scored, sized memo.
//
// Stages (depth-dependent): score+size (deterministic) -> critique ->
// [bull -> bear -> disconfirming (STANDARD/DEEP only)] -> synthesis ->
// grounding audit -> assemble. Numbers are computed by the Calc/Scoring/Sizing
// engines; the LLM only writes analysis around them, and the audit flags any
// figure it can't trace. Token usage and USD cost are accounted per call.

import { z } from "zod";
import type { ModelTier } from "@/lib/llm/service";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
} from "@/lib/plugins/types";
import type { FinancialPacket } from "@/lib/calc/types";
import type { AnalysisDepth, Confidence } from "@/lib/enums";
import { computeScores, type CategoryScore } from "@/lib/scoring/engine";
import { suggestSize, type SizingResult } from "@/lib/sizing/engine";
import {
  CaseSchema,
  CritiqueSchema,
  DisconfirmingSchema,
  SynthesisSchema,
  type Case,
  type Disconfirming,
  type MemoSectionKey,
} from "./schemas";
import {
  casePrompt,
  critiquePrompt,
  disconfirmingPrompt,
  synthesisPrompt,
} from "./prompts";
import { auditText } from "./audit";
import { collectKnownNumbers } from "./context";

// Minimal LLM surface the pipeline needs. LLMService satisfies it structurally;
// tests pass a lightweight fake (e.g. the mock provider) instead.
export interface PipelineLLM {
  readonly providerKey: string;
  complete(
    req: Omit<LLMCompletionRequest, "model">,
    tier: ModelTier,
  ): Promise<LLMCompletionResult>;
  costUsd(model: string, inTok: number, outTok: number): number | null;
}

export interface SizingPolicy {
  maxSingleNamePct: number;
  targetVolPct: number;
}

export interface MemoSectionDraft {
  key: MemoSectionKey | string;
  ordering: number;
  contentMd: string;
  unverifiedFigures: string[];
}

export interface MemoScoreDraft extends CategoryScore {
  rationaleMd: string;
}

export interface MemoDraft {
  rating: string;
  confidence: string;
  timeHorizon: string;
  sizing: SizingResult;
  modelUsed: string;
  providerKey: string;
  sections: MemoSectionDraft[];
  scores: MemoScoreDraft[];
  composite: number;
  markdown: string;
  totalUnverified: number;
  // Actual usage/cost accounting (amendment 7)
  inputTokens: number;
  outputTokens: number;
  actualCostUsd: number;
}

export type ProgressFn = (pct: number, step: string) => void | Promise<void>;

interface UsageAcc {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Extracts a JSON object from possibly-noisy model text, validates it against a
// schema, and retries once with a stricter nudge on failure. Accumulates token
// usage + cost onto `acc`.
async function askJson<T>(
  llm: PipelineLLM,
  prompt: { system: string; user: string },
  schema: z.ZodType<T>,
  tier: ModelTier,
  acc: UsageAcc,
  maxTokens = 4096,
): Promise<{ data: T; model: string }> {
  const attempt = async (extra?: string) => {
    const res = await llm.complete(
      {
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user + (extra ?? "") }],
        maxTokens,
      },
      tier,
    );
    acc.inputTokens += res.inputTokens ?? 0;
    acc.outputTokens += res.outputTokens ?? 0;
    acc.costUsd +=
      llm.costUsd(res.model, res.inputTokens ?? 0, res.outputTokens ?? 0) ?? 0;
    return res;
  };

  let res = await attempt();
  let parsed = tryParse(res.text);
  if (!parsed) {
    res = await attempt(
      "\n\nReturn ONLY valid minified JSON. No prose, no code fences.",
    );
    parsed = tryParse(res.text);
  }
  if (!parsed) {
    throw new Error("LLM did not return parseable JSON after retry.");
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      "LLM JSON failed schema validation: " +
        validated.error.message.slice(0, 300),
    );
  }
  return { data: validated.data, model: res.model };
}

function tryParse(text: string): unknown | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SECTION_TITLES: Record<string, string> = {
  executive_summary: "Executive Summary",
  user_thesis: "User Thesis",
  business_overview: "Business Overview",
  industry_context: "Industry / Theme Context",
  moat_analysis: "Moat Analysis",
  financial_analysis: "Financial Analysis",
  valuation: "Valuation",
  catalysts: "Catalysts",
  risks: "Risks and Challenges",
  disconfirming_evidence: "Disconfirming Evidence",
  portfolio_fit: "Portfolio Fit",
  final_recommendation: "Final Recommendation",
};

const SECTION_ORDER = Object.keys(SECTION_TITLES);

export async function runMemoPipeline(
  llm: PipelineLLM,
  packet: FinancialPacket,
  thesis: string,
  depth: AnalysisDepth,
  sizingPolicy: SizingPolicy,
  onProgress?: ProgressFn,
): Promise<MemoDraft> {
  const report = async (pct: number, step: string) => {
    if (onProgress) await onProgress(pct, step);
  };
  const acc: UsageAcc = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const full = depth !== "QUICK";
  const heavyTier: ModelTier = depth === "DEEP" ? "reasoning" : "drafting";

  await report(10, "Computing transparent scores");
  const scoring = computeScores(packet);

  await report(18, "Critiquing the thesis");
  const critique = await askJson(
    llm, critiquePrompt(thesis, packet), CritiqueSchema, "reasoning", acc,
  );

  let bull: Case | null = null;
  let bear: Case | null = null;
  let disconfirming: Disconfirming | null = null;

  if (full) {
    await report(34, "Building the bull case");
    bull = (
      await askJson(llm, casePrompt("bull", thesis, packet), CaseSchema, heavyTier, acc)
    ).data;

    await report(50, "Building the bear case (adversarial)");
    bear = (
      await askJson(llm, casePrompt("bear", thesis, packet), CaseSchema, "reasoning", acc)
    ).data;

    await report(64, "Surfacing disconfirming evidence");
    disconfirming = (
      await askJson(llm, disconfirmingPrompt(thesis, packet), DisconfirmingSchema, "reasoning", acc)
    ).data;
  }

  await report(78, "Drafting the memo");
  // Sizing needs confidence, which the synthesis proposes — so synthesis runs
  // with a provisional MEDIUM sizing shown, then the final sizing is computed
  // from the model's proposed confidence. The memo stores only the final,
  // deterministic sizing.
  const riskScore =
    scoring.scores.find((s) => s.category === "risk_level")?.value ?? null;
  const provisionalSizing = suggestSize({
    confidence: "MEDIUM",
    riskScore,
    realizedVolPct: packet.metrics.realizedVol1yPct.value,
    maxSingleNamePct: sizingPolicy.maxSingleNamePct,
    targetVolPct: sizingPolicy.targetVolPct,
  });
  const synth = await askJson(
    llm,
    synthesisPrompt({
      thesis,
      packet,
      critique: critique.data,
      bull,
      bear,
      disconfirming,
      scoring,
      sizing: provisionalSizing,
    }),
    SynthesisSchema,
    heavyTier,
    acc,
    depth === "DEEP" ? 8192 : 4096,
  );

  const sizing = suggestSize({
    confidence: synth.data.confidence as Confidence,
    riskScore,
    realizedVolPct: packet.metrics.realizedVol1yPct.value,
    maxSingleNamePct: sizingPolicy.maxSingleNamePct,
    targetVolPct: sizingPolicy.targetVolPct,
  });

  await report(92, "Auditing figures against the data packet");
  const known = collectKnownNumbers(packet);
  // Sizing figures are computed and legitimate for the model to repeat.
  known.add(String(sizing.lowPct));
  known.add(String(sizing.highPct));
  known.add(String(provisionalSizing.lowPct));
  known.add(String(provisionalSizing.highPct));

  const byKey = new Map(synth.data.sections.map((s) => [s.key, s.markdown]));
  const sections: MemoSectionDraft[] = [];
  let totalUnverified = 0;
  SECTION_ORDER.forEach((key, i) => {
    const md = byKey.get(key as MemoSectionKey) ?? "_Not generated._";
    const audit = auditText(md, known);
    totalUnverified += audit.unverified.length;
    sections.push({
      key,
      ordering: i,
      contentMd: md,
      unverifiedFigures: audit.unverified,
    });
  });

  const rationaleByCat = new Map(
    synth.data.scoreRationales.map((r) => [r.category, r.rationaleMd]),
  );
  const scores: MemoScoreDraft[] = scoring.scores.map((s) => ({
    ...s,
    rationaleMd: rationaleByCat.get(s.category) ?? "",
  }));

  const markdown = assembleMarkdown(
    packet, synth.data, sizing, sections, scores, scoring.composite,
  );

  await report(100, "Complete");

  return {
    rating: synth.data.rating,
    confidence: synth.data.confidence,
    timeHorizon: synth.data.timeHorizon,
    sizing,
    modelUsed: synth.model,
    providerKey: llm.providerKey,
    sections,
    scores,
    composite: scoring.composite,
    markdown,
    totalUnverified,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    actualCostUsd: Math.round(acc.costUsd * 10000) / 10000,
  };
}

function assembleMarkdown(
  packet: FinancialPacket,
  synth: z.infer<typeof SynthesisSchema>,
  sizing: SizingResult,
  sections: MemoSectionDraft[],
  scores: MemoScoreDraft[],
  composite: number,
): string {
  const out: string[] = [];
  out.push(`# Investment Memo — ${packet.profile.name} (${packet.ticker})`);
  out.push("");
  out.push(
    `**Rating:** ${synth.rating} · **Confidence:** ${synth.confidence} · **Suggested size:** ${sizing.lowPct}–${sizing.highPct}% (computed) · **Horizon:** ${synth.timeHorizon} · **Composite score:** ${composite}/100`,
  );
  out.push("");
  out.push(`_Sizing formula: ${sizing.rationale}_`);
  out.push("");
  out.push(
    `_Data completeness: ${packet.completeness.level}. Research support, not investment advice._`,
  );
  out.push("");
  for (const s of sections) {
    out.push(`## ${SECTION_TITLES[s.key] ?? s.key}`);
    out.push(s.contentMd);
    if (s.unverifiedFigures.length) {
      out.push(
        `\n> ⚠ Unverified figures (not found in data packet): ${s.unverifiedFigures.join(", ")}`,
      );
    }
    out.push("");
  }
  out.push("## Scorecard");
  out.push("");
  out.push("| Category | Score | Basis | Data |");
  out.push("|---|---|---|---|");
  for (const s of scores) {
    out.push(
      `| ${s.category} | ${s.value}/100 (${s.letter})${s.clamped ? " ⚑clamped" : ""} | ${s.comparative ? "vs peers" : "absolute"} | ${s.dataCompleteness} |`,
    );
  }
  return out.join("\n");
}
