// Mock LLM plugin — deterministic, offline, no API key. Detects the
// `MOCK_STAGE:` marker the pipeline embeds in each prompt and returns valid
// JSON for that stage. Two purposes:
//   1. Makes the memo pipeline fully unit-testable with no network.
//   2. Lets a user with no LLM key click through the whole app end-to-end.
// It does NOT perform real analysis — narrative is templated placeholder text.
// The computed numbers, scores, reverse-DCF and sizing in a mock memo are real.

import { ScoreCategory } from "@/lib/enums";
import { MEMO_SECTION_KEYS } from "@/lib/memo/schemas";
import {
  type LLMProvider,
  type LLMProviderPlugin,
  type PluginConfig,
} from "../types";

function stageOf(system?: string): string {
  const m = system?.match(/MOCK_STAGE:\s*(\w+)/);
  return m?.[1] ?? "unknown";
}

function responseFor(stage: string): unknown {
  switch (stage) {
    case "critique":
      return {
        restatedThesis:
          "[mock] The user expects the company to compound revenue and defend margins.",
        coreBet: "[mock] Durable demand growth outpaces competitive erosion.",
        mustBeTrue: [
          "[mock] Revenue growth persists at recent rates.",
          "[mock] Margins are not competed away.",
        ],
        hiddenAssumptions: [
          "[mock] Assumes current customer concentration is stable.",
          "[mock] Assumes no major regulatory shift.",
        ],
        factVsInference: {
          facts: [
            "[mock] Reported margins and growth are as shown in the packet.",
          ],
          inferences: [
            "[mock] Future durability is an inference, not a fact.",
          ],
        },
      };
    case "bull":
      return {
        points: [
          "[mock] Strong reported margins suggest pricing power.",
          "[mock] Positive free cash flow funds reinvestment.",
        ],
      };
    case "bear":
      return {
        points: [
          "[mock] Valuation may already price in optimistic growth.",
          "[mock] Cyclical demand could compress margins.",
          "[mock] Competitive entry could erode returns.",
        ],
      };
    case "disconfirming":
      return {
        breakingEvidence: [
          "[mock] A sustained deceleration in revenue growth.",
          "[mock] Margin compression over consecutive periods.",
        ],
        whatBearsArgue: [
          "[mock] Bears argue the moat is thinner than the multiple implies.",
        ],
        pricedIn:
          "[mock] The reverse-DCF implied growth in the packet states what the market is pricing in.",
        openQuestions: [
          "[mock] What is the real switching cost for customers?",
          "[mock] How durable is the current margin structure?",
        ],
      };
    case "synthesis":
      return {
        sections: MEMO_SECTION_KEYS.map((key) => ({
          key,
          markdown: `_[mock] Placeholder ${key.replace(/_/g, " ")} narrative. Connect a real LLM provider (Anthropic/OpenAI) in Settings for genuine analysis. The numbers, scores, implied-growth and sizing in this memo are computed deterministically and are real._`,
        })),
        rating: "NEEDS_WORK",
        confidence: "LOW",
        timeHorizon: "3–5 years",
        scoreRationales: Object.values(ScoreCategory).map((category) => ({
          category,
          rationaleMd: `[mock] Rationale for ${category} would be written by a real model.`,
        })),
      };
    default:
      return { note: "[mock] no stage matched" };
  }
}

function createMockProvider(_config: PluginConfig): LLMProvider {
  return {
    key: "mock",
    async complete(req) {
      const stage = stageOf(req.system);
      const text = JSON.stringify(responseFor(stage));
      return {
        text,
        model: "mock-1",
        // Rough deterministic token accounting so cost math is exercised.
        inputTokens: Math.ceil(
          (req.system?.length ?? 0) / 4 +
            req.messages.reduce((s, m) => s + m.content.length, 0) / 4,
        ),
        outputTokens: Math.ceil(text.length / 4),
      };
    },
    async healthCheck() {
      return {
        ok: true,
        message: "Mock provider — offline demo, not real analysis.",
      };
    },
  };
}

export const mockPlugin: LLMProviderPlugin = {
  manifest: {
    key: "mock",
    name: "Mock (offline demo)",
    description:
      "No API key needed. Runs the full pipeline with REAL computed numbers/scores but PLACEHOLDER narrative. Use it to try the app before connecting Anthropic or OpenAI.",
    kind: "LLM",
    configFields: [],
    models: [
      {
        id: "mock-1",
        label: "Mock",
        tier: "reasoning",
        pricing: { usdPerMTokIn: 0, usdPerMTokOut: 0 },
      },
      {
        id: "mock-1",
        label: "Mock",
        tier: "drafting",
        pricing: { usdPerMTokIn: 0, usdPerMTokOut: 0 },
      },
    ],
  },
  create: createMockProvider,
};
