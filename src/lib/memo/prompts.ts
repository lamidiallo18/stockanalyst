// Prompt construction for the memo pipeline. The shared persona enforces the
// skeptical buy-side tone and the grounding contract; each stage adds its own
// task + output-schema instructions. A `MOCK_STAGE:` marker lets the mock LLM
// provider produce deterministic test output; real models simply ignore it.

import type { FinancialPacket } from "@/lib/calc/types";
import type { ScoringResult } from "@/lib/scoring/engine";
import { renderPacketContext } from "./context";
import type { Critique, Case, Disconfirming } from "./schemas";
import { MEMO_SECTION_KEYS } from "./schemas";

export const PERSONA = `You are a skeptical, disciplined buy-side investment analyst writing for an internal audience. You are NOT a stock promoter. Be clear, direct, analytical, and objective.

Hard rules:
1. GROUNDING: The only quantitative facts you may state are those provided in the DATA PACKET. Never invent or estimate numbers. If a figure is not in the packet, say "not available" rather than guessing. Reference packet field IDs (e.g. metrics.roic) when making a quantitative claim.
2. Separate FACT from INFERENCE. Label assumptions as assumptions.
3. Actively challenge the thesis. Identify what must be true, what is already priced in, and what would make the thesis wrong.
4. Flag missing or low-reliability data (REPORTED/DERIVED/PROXY/STALE/MISSING flags are in the packet).
5. This is research support, not investment advice. No guarantees.`;

function jsonInstruction(shape: string): string {
  return `\n\nRespond with ONLY a single valid JSON object, no prose, no code fences, matching this shape:\n${shape}`;
}

export function critiquePrompt(thesis: string, packet: FinancialPacket) {
  const system = `${PERSONA}\nMOCK_STAGE: critique`;
  const user =
    `DATA PACKET:\n${renderPacketContext(packet)}\n\n` +
    `USER THESIS:\n"${thesis}"\n\n` +
    `TASK: Critically analyze this thesis. Restate it precisely, identify the core bet, enumerate what must be true for it to work, surface HIDDEN assumptions the user may not realize they are making, and separate which claims are facts vs inferences.` +
    jsonInstruction(
      `{"restatedThesis": string, "coreBet": string, "mustBeTrue": string[], "hiddenAssumptions": string[], "factVsInference": {"facts": string[], "inferences": string[]}}`,
    );
  return { system, user };
}

export function casePrompt(
  side: "bull" | "bear",
  thesis: string,
  packet: FinancialPacket,
) {
  const system = `${PERSONA}\nMOCK_STAGE: ${side}`;
  const stance =
    side === "bull"
      ? "Build the STRONGEST honest version of the LONG case"
      : "Build the STRONGEST honest version of the SHORT/BEAR case. Be genuinely adversarial — assume the user is wrong and argue why";
  const user =
    `DATA PACKET:\n${renderPacketContext(packet)}\n\n` +
    `USER THESIS:\n"${thesis}"\n\n` +
    `TASK: ${stance}. Ground every quantitative point in packet fields.` +
    jsonInstruction(`{"points": string[]}`);
  return { system, user };
}

export function disconfirmingPrompt(thesis: string, packet: FinancialPacket) {
  const system = `${PERSONA}\nMOCK_STAGE: disconfirming`;
  const user =
    `DATA PACKET:\n${renderPacketContext(packet)}\n\n` +
    `USER THESIS:\n"${thesis}"\n\n` +
    `TASK: Identify disconfirming evidence — what would weaken or break this thesis, what bears would argue, what is already priced in (reference valuation percentiles), and the key open questions that still need answering.` +
    jsonInstruction(
      `{"breakingEvidence": string[], "whatBearsArgue": string[], "pricedIn": string, "openQuestions": string[]}`,
    );
  return { system, user };
}

export function synthesisPrompt(args: {
  thesis: string;
  packet: FinancialPacket;
  critique: Critique;
  bull: Case;
  bear: Case;
  disconfirming: Disconfirming;
  scoring: ScoringResult;
}) {
  const { thesis, packet, critique, bull, bear, disconfirming, scoring } = args;
  const system = `${PERSONA}\nMOCK_STAGE: synthesis`;
  const scoreLines = scoring.scores
    .map((s) => `${s.category}=${s.value}/100 (${s.letter}, completeness ${s.dataCompleteness})`)
    .join("; ");
  const user =
    `DATA PACKET:\n${renderPacketContext(packet)}\n\n` +
    `USER THESIS:\n"${thesis}"\n\n` +
    `THESIS CRITIQUE:\n${JSON.stringify(critique)}\n\n` +
    `BULL POINTS:\n${JSON.stringify(bull.points)}\n\n` +
    `BEAR POINTS:\n${JSON.stringify(bear.points)}\n\n` +
    `DISCONFIRMING:\n${JSON.stringify(disconfirming)}\n\n` +
    `PRECOMPUTED SCORES (do not change the numbers — explain them):\n${scoreLines}\n\n` +
    `TASK: Write the investment memo as markdown sections. Required section keys (use exactly these): ${MEMO_SECTION_KEYS.join(", ")}. ` +
    `Each section should be tight and skeptical. The final_recommendation must align with the precomputed scores and the bear case. ` +
    `Also propose a rating, confidence, a position-size RANGE as % of portfolio (0 if avoid), a time horizon, and a one-paragraph rationale for EACH score category (use the exact category keys).` +
    jsonInstruction(
      `{"sections": [{"key": string, "markdown": string}], "rating": "ATTRACTIVE"|"WATCHLIST"|"AVOID"|"TOO_HARD"|"NEEDS_WORK", "confidence": "LOW"|"MEDIUM"|"HIGH", "positionSizeLowPct": number, "positionSizeHighPct": number, "timeHorizon": string, "scoreRationales": [{"category": string, "rationaleMd": string}]}`,
    );
  return { system, user };
}
