import { describe, it, expect } from "vitest";
import { applyClamp, computeScores } from "./engine";
import { computePacket, type CalcPeerInput } from "@/lib/calc/engine";
import { fixtureInput, fixturePacket, fy } from "@/lib/test-fixtures";

// A strong peer set so comparative scoring activates (>= 3 peers w/ metrics).
function peerSet(): CalcPeerInput[] {
  const mk = (t: string, opMargin: number, roic: number): CalcPeerInput => ({
    peer: { ticker: t },
    quote: { ticker: t, asOf: "2024-01-01", price: 10, marketCap: 1000 },
    financials: {
      ticker: t,
      periods: [
        fy("2023-12-31", {
          revenue: 1000,
          grossProfit: 500,
          opIncome: opMargin * 10,
          ebitda: 300,
          netIncome: 100,
          totalDebt: 100,
          cash: 50,
          totalEquity: (opMargin * 10 * 0.79) / (roic / 100) - 50, // back into ROIC
        }),
        fy("2022-12-31", { revenue: 950 }),
        fy("2021-12-31", { revenue: 900 }),
        fy("2020-12-31", { revenue: 850 }),
      ],
    },
  });
  return [mk("P1", 10, 8), mk("P2", 15, 12), mk("P3", 20, 15)];
}

describe("applyClamp (amendment 4 — anti-regression rule)", () => {
  it("clamps a >80 score with <2 evidence refs to 80 and flags it", () => {
    expect(applyClamp(95, 1)).toEqual({ value: 80, clamped: true });
    expect(applyClamp(81, 0)).toEqual({ value: 80, clamped: true });
  });
  it("clamps a <40 score with <2 evidence refs to 40 and flags it", () => {
    expect(applyClamp(12, 1)).toEqual({ value: 40, clamped: true });
  });
  it("allows extremes with >=2 evidence refs", () => {
    expect(applyClamp(95, 2)).toEqual({ value: 95, clamped: false });
    expect(applyClamp(12, 3)).toEqual({ value: 12, clamped: false });
  });
  it("mid-range scores never clamp", () => {
    expect(applyClamp(60, 0)).toEqual({ value: 60, clamped: false });
  });
});

describe("computeScores", () => {
  it("produces exactly 9 categories (no portfolio_fit in v1)", () => {
    const r = computeScores(fixturePacket());
    expect(r.scores).toHaveLength(9);
    expect(r.scores.map((s) => s.category)).not.toContain("portfolio_fit");
    expect(r.composite).toBeGreaterThan(0);
    expect(r.composite).toBeLessThanOrEqual(100);
  });

  it("qualitative categories score comparatively when >=3 peers have data", () => {
    const p = computePacket(fixtureInput({ peers: peerSet() }));
    const r = computeScores(p);
    const moat = r.scores.find((s) => s.category === "moat_durability")!;
    expect(moat.comparative).toBe(true);
    // Fixture company (30% op margin, 30% ROIC) tops this peer set.
    expect(moat.value).toBeGreaterThanOrEqual(70);
  });

  it("falls back to absolute scales without peers (not comparative)", () => {
    const r = computeScores(fixturePacket());
    const moat = r.scores.find((s) => s.category === "moat_durability")!;
    expect(moat.comparative).toBe(false);
  });

  it("every score carries transparent signals", () => {
    const r = computeScores(fixturePacket());
    for (const s of r.scores) {
      expect(s.signals.length).toBeGreaterThan(0);
      expect(s.signals[0]).toHaveProperty("label");
    }
  });

  it("valuation category uses the computed reverse-DCF implied growth", () => {
    const r = computeScores(fixturePacket());
    const valScore = r.scores.find(
      (s) => s.category === "valuation_attractiveness",
    )!;
    expect(
      valScore.signals.some((sig) => sig.label.includes("Implied FCF growth")),
    ).toBe(true);
    expect(valScore.evidence.some((e) => e.ref === "reverseDcf")).toBe(true);
  });

  it("thesis_confidence is lower on sparse data than rich data", () => {
    const rich = computeScores(fixturePacket()).scores.find(
      (s) => s.category === "thesis_confidence",
    )!;
    const sparse = computeScores(
      computePacket({
        profile: { ticker: "X", name: "X" },
        financials: {
          ticker: "X",
          periods: [fy("2023-12-31", { revenue: 100 })],
        },
      }),
    ).scores.find((s) => s.category === "thesis_confidence")!;
    expect(sparse.value).toBeLessThan(rich.value);
  });

  it("clamp integrates end-to-end: sparse extreme scores get flagged", () => {
    // A packet with only one populated signal per category can't justify
    // extremes; if any category lands outside [40,80] it must be clamped.
    const p = computePacket({
      profile: { ticker: "X", name: "X" },
      financials: {
        ticker: "X",
        periods: [fy("2023-12-31", { revenue: 100, opIncome: -50 })],
      },
    });
    const r = computeScores(p);
    for (const s of r.scores) {
      if (s.value > 80 || s.value < 40) {
        // extremes are only allowed with >= 2 populated evidence refs
        const populated =
          s.evidence.length + s.signals.filter((x) => x.value !== "—").length;
        expect(populated).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
