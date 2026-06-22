// Zod schemas for the structured outputs of each LLM stage. Every LLM response
// is parsed + validated against these before use, so malformed model output
// fails loudly rather than silently corrupting a memo.
import { z } from "zod";

export const MEMO_SECTION_KEYS = [
  "executive_summary",
  "user_thesis",
  "business_overview",
  "industry_context",
  "moat_analysis",
  "financial_analysis",
  "valuation",
  "catalysts",
  "risks",
  "disconfirming_evidence",
  "portfolio_fit",
  "final_recommendation",
] as const;

export type MemoSectionKey = (typeof MEMO_SECTION_KEYS)[number];

export const CritiqueSchema = z.object({
  restatedThesis: z.string(),
  coreBet: z.string(),
  mustBeTrue: z.array(z.string()),
  hiddenAssumptions: z.array(z.string()),
  factVsInference: z.object({
    facts: z.array(z.string()),
    inferences: z.array(z.string()),
  }),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const CaseSchema = z.object({
  points: z.array(z.string()),
});
export type Case = z.infer<typeof CaseSchema>;

export const DisconfirmingSchema = z.object({
  breakingEvidence: z.array(z.string()),
  whatBearsArgue: z.array(z.string()),
  pricedIn: z.string(),
  openQuestions: z.array(z.string()),
});
export type Disconfirming = z.infer<typeof DisconfirmingSchema>;

export const RATINGS = [
  "ATTRACTIVE",
  "WATCHLIST",
  "AVOID",
  "TOO_HARD",
  "NEEDS_WORK",
] as const;
export const CONFIDENCE = ["LOW", "MEDIUM", "HIGH"] as const;

export const SynthesisSchema = z.object({
  sections: z.array(
    z.object({
      key: z.enum(MEMO_SECTION_KEYS),
      markdown: z.string(),
    }),
  ),
  rating: z.enum(RATINGS),
  confidence: z.enum(CONFIDENCE),
  positionSizeLowPct: z.number().min(0).max(100),
  positionSizeHighPct: z.number().min(0).max(100),
  timeHorizon: z.string(),
  scoreRationales: z.array(
    z.object({
      category: z.string(),
      rationaleMd: z.string(),
    }),
  ),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;
