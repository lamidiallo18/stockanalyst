import { describe, it, expect } from "vitest";
import { runMemoPipeline, type PipelineLLM } from "./pipeline";
import { mockPlugin } from "@/lib/plugins/llm/mock";
import { buildSourcesContext } from "./sources-context";
import { MEMO_SECTION_KEYS } from "./schemas";
import { ScoreCategory } from "@/lib/enums";
import { computePacket } from "@/lib/calc/engine";
import type { NormalizedFinancials, NormalizedPeriod } from "@/lib/plugins/types";

function fy(date: string, over: Partial<NormalizedPeriod>): NormalizedPeriod {
  return { periodType: "FY", fiscalDate: date, ...over };
}

const financials: NormalizedFinancials = {
  ticker: "TEST",
  periods: [
    fy("2023-12-31", {
      revenue: 1000, grossProfit: 600, opIncome: 300, ebitda: 350, netIncome: 200,
      pretaxIncome: 250, incomeTax: 50, ocf: 280, capex: 80,
      totalDebt: 400, cash: 100, totalEquity: 500, shares: 100,
    }),
    fy("2022-12-31", { revenue: 900, shares: 102 }),
    fy("2021-12-31", { revenue: 800, shares: 105 }),
    fy("2020-12-31", { revenue: 500, shares: 110 }),
  ],
};

const packet = computePacket({
  profile: { ticker: "TEST", name: "Test Corp", sector: "Tech" },
  quote: { ticker: "TEST", asOf: "2024-01-01T00:00:00Z", price: 50, marketCap: 5000 },
  financials,
  historicalRatios: [
    { fiscalDate: "2021-12-31", pe: 20 },
    { fiscalDate: "2022-12-31", pe: 30 },
    { fiscalDate: "2023-12-31", pe: 25 },
  ],
  now: new Date("2024-01-02T00:00:00Z"),
});

// Adapt the offline mock provider to the PipelineLLM shape.
const mock = mockPlugin.create({});
const fakeLLM: PipelineLLM = {
  providerKey: "mock",
  complete: (req) => mock.complete(req),
};

describe("runMemoPipeline (mock provider)", () => {
  it("produces a complete, well-formed memo draft", async () => {
    const draft = await runMemoPipeline(fakeLLM, packet, "Durable compounder.");
    expect(draft.sections).toHaveLength(12);
    expect(draft.scores).toHaveLength(10);
    expect(draft.rating).toBe("NEEDS_WORK"); // mock's deterministic rating
    expect(draft.composite).toBeGreaterThan(0);
    expect(draft.markdown).toContain("Investment Memo");
    expect(draft.providerKey).toBe("mock");
  });

  it("merges deterministic scores with LLM rationales", async () => {
    const draft = await runMemoPipeline(fakeLLM, packet, "x");
    for (const s of draft.scores) {
      expect(s.rationaleMd.length).toBeGreaterThan(0);
    }
  });

  it("reports progress monotonically to 100", async () => {
    const seen: number[] = [];
    await runMemoPipeline(fakeLLM, packet, "x", (pct) => {
      seen.push(pct);
    });
    expect(seen[seen.length - 1]).toBe(100);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });

  it("mock narrative is clean of unverified figures", async () => {
    const draft = await runMemoPipeline(fakeLLM, packet, "x");
    // Mock placeholder text contains no stray numbers.
    expect(draft.totalUnverified).toBe(0);
  });
});

describe("runMemoPipeline — source citations", () => {
  // A fake LLM that emits an [S1] citation in the moat section at synthesis.
  const citingLLM: PipelineLLM = {
    providerKey: "fake",
    complete: async (req) => {
      const stage = req.system?.match(/MOCK_STAGE:\s*(\w+)/)?.[1] ?? "";
      if (stage === "synthesis") {
        return {
          text: JSON.stringify({
            sections: MEMO_SECTION_KEYS.map((key) => ({
              key,
              markdown:
                key === "moat_analysis"
                  ? "Switching costs are high per the uploaded report [S1]."
                  : `Section ${key}.`,
            })),
            rating: "WATCHLIST",
            confidence: "MEDIUM",
            positionSizeLowPct: 1,
            positionSizeHighPct: 3,
            timeHorizon: "3y",
            scoreRationales: Object.values(ScoreCategory).map((category) => ({
              category,
              rationaleMd: "ok",
            })),
          }),
          model: "fake-1",
        };
      }
      // Delegate other stages to the deterministic mock.
      return mock.complete(req);
    },
  };

  it("captures [S#] markers as citations linked to source chunks", async () => {
    const sources = buildSourcesContext([
      { id: "chunk-123", text: "High switching costs.", filename: "report.pdf", page: 4, score: 5 },
    ]);
    const draft = await runMemoPipeline(citingLLM, packet, "x", undefined, sources);
    expect(draft.citations.length).toBe(1);
    expect(draft.citations[0].sectionKey).toBe("moat_analysis");
    expect(draft.citations[0].chunkId).toBe("chunk-123");
    expect(draft.citations[0].filename).toBe("report.pdf");
  });
});
