// Memo pipeline — orchestrates the multi-stage LLM reasoning that turns a
// Financial Packet + user thesis into a grounded, scored investment memo.
//
// Stages: score (deterministic) -> critique -> bull -> bear -> disconfirming ->
// synthesis (sections + rating + score rationales) -> grounding audit -> assemble.
// Numbers are computed by the Calc/Scoring engines; the LLM only writes
// analysis around them, and the audit flags any figure it can't trace.
import { z } from "zod";
import type { ModelTier } from "@/lib/llm/service";
import type { LLMCompletionRequest, LLMCompletionResult } from "@/lib/plugins/types";
import type { FinancialPacket } from "@/lib/calc/types";
import { computeScores, type CategoryScore } from "@/lib/scoring/engine";
import {
  CaseSchema,
  CritiqueSchema,
  DisconfirmingSchema,
  SynthesisSchema,
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
import {
  extractCitationMarkers,
  type SourcesContext,
} from "./sources-context";

// Minimal LLM surface the pipeline needs. LLMService satisfies it structurally;
// tests pass a lightweight fake (e.g. the mock provider) instead.
export interface PipelineLLM {
  readonly providerKey: string;
  complete(
    req: Omit<LLMCompletionRequest, "model">,
    tier: ModelTier,
  ): Promise<LLMCompletionResult>;
}

export interface MemoSectionDraft {
  key: MemoSectionKey | string;
  ordering: number;
  contentMd: string;
  unverifiedFigures: string[];
}

export interface MemoCitationDraft {
  sectionKey: string;
  marker: string;
  chunkId: string;
  sourceId?: string;
  filename?: string;
  page?: number;
}

export interface MemoScoreDraft extends CategoryScore {
  rationaleMd: string;
}

export interface MemoDraft {
  rating: string;
  confidence: string;
  positionSizeLow: number;
  positionSizeHigh: number;
  timeHorizon: string;
  modelUsed: string;
  providerKey: string;
  sections: MemoSectionDraft[];
  scores: MemoScoreDraft[];
  citations: MemoCitationDraft[];
  composite: number;
  markdown: string;
  totalUnverified: number;
}

export type ProgressFn = (pct: number, step: string) => void | Promise<void>;

// Extracts a JSON object from possibly-noisy model text, validates it against a
// schema, and retries once with a stricter nudge on failure.
async function askJson<T>(
  llm: PipelineLLM,
  prompt: { system: string; user: string },
  schema: z.ZodType<T>,
  tier: ModelTier,
): Promise<{ data: T; model: string }> {
  const attempt = async (extra?: string) => {
    const res = await llm.complete(
      {
        system: prompt.system,
        messages: [
          { role: "user", content: prompt.user + (extra ?? "") },
        ],
        maxTokens: 4096,
      },
      tier,
    );
    return res;
  };

  let res = await attempt();
  let parsed = tryParse(res.text);
  if (!parsed) {
    res = await attempt("\n\nReturn ONLY valid minified JSON. No prose, no code fences.");
    parsed = tryParse(res.text);
  }
  if (!parsed) {
    throw new Error("LLM did not return parseable JSON after retry.");
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      "LLM JSON failed schema validation: " + validated.error.message.slice(0, 300),
    );
  }
  return { data: validated.data, model: res.model };
}

function tryParse(text: string): unknown | null {
  // Strip code fences and grab the outermost {...}.
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
  onProgress?: ProgressFn,
  sources?: SourcesContext | null,
): Promise<MemoDraft> {
  const report = async (pct: number, step: string) => {
    if (onProgress) await onProgress(pct, step);
  };
  const sourcesBlock = sources?.block;

  await report(10, "Computing transparent scores");
  const scoring = computeScores(packet);

  await report(22, "Critiquing the thesis");
  const critique = await askJson(llm, critiquePrompt(thesis, packet, sourcesBlock), CritiqueSchema, "reasoning");

  await report(38, "Building the bull case");
  const bull = await askJson(llm, casePrompt("bull", thesis, packet, sourcesBlock), CaseSchema, "drafting");

  await report(54, "Building the bear case (adversarial)");
  const bear = await askJson(llm, casePrompt("bear", thesis, packet, sourcesBlock), CaseSchema, "reasoning");

  await report(68, "Surfacing disconfirming evidence");
  const disconfirming = await askJson(llm, disconfirmingPrompt(thesis, packet, sourcesBlock), DisconfirmingSchema, "reasoning");

  await report(85, "Drafting the memo");
  const synth = await askJson(
    llm,
    synthesisPrompt({
      thesis,
      packet,
      critique: critique.data,
      bull: bull.data,
      bear: bear.data,
      disconfirming: disconfirming.data,
      scoring,
      sourcesBlock,
    }),
    SynthesisSchema,
    "drafting",
  );

  await report(93, "Auditing figures against the data packet");
  const known = collectKnownNumbers(packet);

  // Assemble sections in canonical order, running the grounding audit on each.
  const byKey = new Map(synth.data.sections.map((s) => [s.key, s.markdown]));
  const sections: MemoSectionDraft[] = [];
  let totalUnverified = 0;
  const citations: MemoCitationDraft[] = [];
  SECTION_ORDER.forEach((key, i) => {
    const md = byKey.get(key as MemoSectionKey) ?? "_Not generated._";
    const audit = auditText(md, known);
    totalUnverified += audit.unverified.length;
    sections.push({ key, ordering: i, contentMd: md, unverifiedFigures: audit.unverified });
    // Map any [S#] markers the model used back to their source chunks.
    if (sources) {
      for (const marker of extractCitationMarkers(md)) {
        const m = sources.byMarker[marker];
        if (m) {
          citations.push({
            sectionKey: key,
            marker,
            chunkId: m.chunkId,
            sourceId: m.sourceId,
            filename: m.filename,
            page: m.page,
          });
        }
      }
    }
  });

  // Merge LLM score rationales onto the deterministic scores.
  const rationaleByCat = new Map(
    synth.data.scoreRationales.map((r) => [r.category, r.rationaleMd]),
  );
  const scores: MemoScoreDraft[] = scoring.scores.map((s) => ({
    ...s,
    rationaleMd: rationaleByCat.get(s.category) ?? "",
  }));

  const markdown = assembleMarkdown(packet, synth.data, sections, scores, scoring.composite);

  await report(100, "Complete");

  return {
    rating: synth.data.rating,
    confidence: synth.data.confidence,
    positionSizeLow: synth.data.positionSizeLowPct,
    positionSizeHigh: synth.data.positionSizeHighPct,
    timeHorizon: synth.data.timeHorizon,
    modelUsed: synth.model,
    providerKey: llm.providerKey,
    sections,
    scores,
    citations,
    composite: scoring.composite,
    markdown,
    totalUnverified,
  };
}

function assembleMarkdown(
  packet: FinancialPacket,
  synth: z.infer<typeof SynthesisSchema>,
  sections: MemoSectionDraft[],
  scores: MemoScoreDraft[],
  composite: number,
): string {
  const out: string[] = [];
  out.push(`# Investment Memo — ${packet.profile.name} (${packet.ticker})`);
  out.push("");
  out.push(
    `**Rating:** ${synth.rating} · **Confidence:** ${synth.confidence} · **Suggested size:** ${synth.positionSizeLowPct}–${synth.positionSizeHighPct}% · **Horizon:** ${synth.timeHorizon} · **Composite score:** ${composite}/100`,
  );
  out.push("");
  out.push(`_Data completeness: ${packet.completeness.level}. Research support, not investment advice._`);
  out.push("");
  for (const s of sections) {
    out.push(`## ${SECTION_TITLES[s.key] ?? s.key}`);
    out.push(s.contentMd);
    if (s.unverifiedFigures.length) {
      out.push(`\n> ⚠ Unverified figures (not found in data packet): ${s.unverifiedFigures.join(", ")}`);
    }
    out.push("");
  }
  out.push("## Scorecard");
  out.push("");
  out.push("| Category | Score | Data |");
  out.push("|---|---|---|");
  for (const s of scores) {
    out.push(`| ${s.category} | ${s.value}/100 (${s.letter}) | ${s.dataCompleteness} |`);
  }
  return out.join("\n");
}
