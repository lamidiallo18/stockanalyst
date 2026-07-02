// Per-memo cost estimation (amendment 7). Estimates token usage per depth
// tier BEFORE a run starts, priced from the enabled LLM plugin's catalog.
// Actuals are accounted per-call in the pipeline and stored on the Memo.
//
// The token numbers are calibrated heuristics (packet context ≈ 2.5-3.5k
// tokens; JSON stage outputs are bounded by the schemas), deliberately on the
// generous side so estimates err high rather than low.

import type { AnalysisDepth } from "@/lib/enums";
import type { ModelTier } from "./service";

export interface StagePlan {
  stage: string;
  tier: ModelTier;
  estInputTokens: number;
  estOutputTokens: number;
}

// Which LLM stages run at each depth, and their expected token shapes.
// QUICK skips the separate bull/bear/disconfirming passes (critique +
// synthesis only); DEEP runs everything on the reasoning tier with more room.
export function stagePlanFor(depth: AnalysisDepth): StagePlan[] {
  const packet = 3000; // packet context + persona + task, per call
  switch (depth) {
    case "QUICK":
      return [
        { stage: "critique", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 900 },
        { stage: "synthesis", tier: "drafting", estInputTokens: packet + 1600, estOutputTokens: 2600 },
      ];
    case "DEEP":
      return [
        { stage: "critique", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 1200 },
        { stage: "bull", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 900 },
        { stage: "bear", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 1100 },
        { stage: "disconfirming", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 1100 },
        { stage: "synthesis", tier: "reasoning", estInputTokens: packet + 4200, estOutputTokens: 4200 },
      ];
    default: // STANDARD
      return [
        { stage: "critique", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 1000 },
        { stage: "bull", tier: "drafting", estInputTokens: packet + 400, estOutputTokens: 700 },
        { stage: "bear", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 900 },
        { stage: "disconfirming", tier: "reasoning", estInputTokens: packet + 400, estOutputTokens: 900 },
        { stage: "synthesis", tier: "drafting", estInputTokens: packet + 3400, estOutputTokens: 3400 },
      ];
  }
}

export interface CostEstimate {
  depth: AnalysisDepth;
  providerKey: string;
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  perStage: {
    stage: string;
    model: string;
    estUsd: number;
  }[];
}

// `svc` is the minimal pricing surface of LLMService (structural, testable).
export function estimateCost(
  svc: {
    providerKey: string;
    modelFor(tier: ModelTier): string;
    costUsd(model: string, inTok: number, outTok: number): number | null;
  },
  depth: AnalysisDepth,
): CostEstimate {
  const plan = stagePlanFor(depth);
  let totalUsd = 0;
  let totalIn = 0;
  let totalOut = 0;
  const perStage = plan.map((s) => {
    const model = svc.modelFor(s.tier);
    const usd = svc.costUsd(model, s.estInputTokens, s.estOutputTokens) ?? 0;
    totalUsd += usd;
    totalIn += s.estInputTokens;
    totalOut += s.estOutputTokens;
    return { stage: s.stage, model, estUsd: Math.round(usd * 10000) / 10000 };
  });
  return {
    depth,
    providerKey: svc.providerKey,
    totalUsd: Math.round(totalUsd * 10000) / 10000,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    perStage,
  };
}
