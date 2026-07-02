import { describe, it, expect } from "vitest";
import { runMemoPipeline, type PipelineLLM } from "./pipeline";
import { mockPlugin } from "@/lib/plugins/llm/mock";
import { fixturePacket } from "@/lib/test-fixtures";

const packet = fixturePacket();
const sizingPolicy = { maxSingleNamePct: 8, targetVolPct: 25 };

function makeFakeLLM(costPerCall = 0.01): PipelineLLM & { calls: number } {
  const mock = mockPlugin.create({});
  const fake = {
    providerKey: "mock",
    calls: 0,
    async complete(req: Parameters<PipelineLLM["complete"]>[0]) {
      fake.calls++;
      return mock.complete(req);
    },
    costUsd() {
      return costPerCall;
    },
  };
  return fake;
}

describe("runMemoPipeline (mock provider)", () => {
  it("produces a complete, well-formed memo draft", async () => {
    const draft = await runMemoPipeline(
      makeFakeLLM(), packet, "Durable compounder.", "STANDARD", sizingPolicy,
    );
    expect(draft.sections).toHaveLength(12);
    expect(draft.scores).toHaveLength(9);
    expect(draft.rating).toBe("NEEDS_WORK"); // mock's deterministic rating
    expect(draft.composite).toBeGreaterThan(0);
    expect(draft.markdown).toContain("Investment Memo");
    expect(draft.providerKey).toBe("mock");
  });

  it("computes sizing deterministically (never from the LLM)", async () => {
    const draft = await runMemoPipeline(
      makeFakeLLM(), packet, "x", "STANDARD", sizingPolicy,
    );
    expect(draft.sizing.lowPct).toBeGreaterThanOrEqual(0);
    expect(draft.sizing.highPct).toBeLessThanOrEqual(8);
    expect(draft.sizing.rationale).toContain("base");
  });

  it("QUICK depth makes fewer LLM calls than STANDARD", async () => {
    const quick = makeFakeLLM();
    await runMemoPipeline(quick, packet, "x", "QUICK", sizingPolicy);
    const std = makeFakeLLM();
    await runMemoPipeline(std, packet, "x", "STANDARD", sizingPolicy);
    expect(quick.calls).toBe(2); // critique + synthesis
    expect(std.calls).toBe(5);
  });

  it("accounts token usage and cost across calls", async () => {
    const llm = makeFakeLLM(0.02);
    const draft = await runMemoPipeline(llm, packet, "x", "STANDARD", sizingPolicy);
    expect(draft.inputTokens).toBeGreaterThan(0);
    expect(draft.outputTokens).toBeGreaterThan(0);
    expect(draft.actualCostUsd).toBeCloseTo(llm.calls * 0.02, 5);
  });

  it("merges deterministic scores with LLM rationales", async () => {
    const draft = await runMemoPipeline(
      makeFakeLLM(), packet, "x", "STANDARD", sizingPolicy,
    );
    for (const s of draft.scores) {
      expect(s.rationaleMd.length).toBeGreaterThan(0);
    }
  });

  it("reports progress monotonically to 100", async () => {
    const seen: number[] = [];
    await runMemoPipeline(
      makeFakeLLM(), packet, "x", "STANDARD", sizingPolicy,
      (pct) => { seen.push(pct); },
    );
    expect(seen[seen.length - 1]).toBe(100);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });

  it("mock narrative is clean of unverified figures (audit passes)", async () => {
    const draft = await runMemoPipeline(
      makeFakeLLM(), packet, "x", "STANDARD", sizingPolicy,
    );
    expect(draft.totalUnverified).toBe(0);
  });
});
