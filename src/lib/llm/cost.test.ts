import { describe, it, expect } from "vitest";
import { estimateCost, stagePlanFor } from "./cost";
import type { ModelTier } from "./service";

// Fake pricing surface: reasoning $5/$25 per MTok, drafting $3/$15.
const svc = {
  providerKey: "fake",
  modelFor(tier: ModelTier) {
    return tier === "reasoning" ? "big-model" : "small-model";
  },
  costUsd(model: string, inTok: number, outTok: number) {
    const p =
      model === "big-model" ? { i: 5, o: 25 } : { i: 3, o: 15 };
    return (inTok * p.i + outTok * p.o) / 1_000_000;
  },
};

describe("stagePlanFor", () => {
  it("QUICK runs 2 LLM stages, STANDARD and DEEP run 5", () => {
    expect(stagePlanFor("QUICK")).toHaveLength(2);
    expect(stagePlanFor("STANDARD")).toHaveLength(5);
    expect(stagePlanFor("DEEP")).toHaveLength(5);
  });
  it("DEEP uses the reasoning tier throughout", () => {
    expect(stagePlanFor("DEEP").every((s) => s.tier === "reasoning")).toBe(true);
  });
});

describe("estimateCost", () => {
  it("cost ordering: QUICK < STANDARD < DEEP", () => {
    const q = estimateCost(svc, "QUICK").totalUsd;
    const s = estimateCost(svc, "STANDARD").totalUsd;
    const d = estimateCost(svc, "DEEP").totalUsd;
    expect(q).toBeLessThan(s);
    expect(s).toBeLessThan(d);
  });
  it("per-stage breakdown carries model + usd", () => {
    const e = estimateCost(svc, "STANDARD");
    expect(e.perStage).toHaveLength(5);
    for (const st of e.perStage) {
      expect(st.model).toMatch(/model/);
      expect(st.estUsd).toBeGreaterThan(0);
    }
    expect(e.totalUsd).toBeCloseTo(
      e.perStage.reduce((s, x) => s + x.estUsd, 0),
      3,
    );
  });
  it("zero-priced provider (mock) estimates $0", () => {
    const free = {
      ...svc,
      costUsd: () => 0,
    };
    expect(estimateCost(free, "DEEP").totalUsd).toBe(0);
  });
});
