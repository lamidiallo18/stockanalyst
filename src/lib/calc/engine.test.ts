import { describe, it, expect } from "vitest";
import { computePacket } from "./engine";
import { fixtureInput, fixturePacket, fy, FIXTURE_FINANCIALS } from "@/lib/test-fixtures";

describe("computePacket — margins & returns", () => {
  const p = fixturePacket();
  it("gross/op/net/fcf margins", () => {
    expect(p.metrics.grossMargin.value).toBe(60);
    expect(p.metrics.opMargin.value).toBe(30);
    expect(p.metrics.netMargin.value).toBe(20);
    expect(p.metrics.fcfMargin.value).toBe(20);
  });
  it("derives FCF from OCF - capex", () => {
    expect(p.metrics.fcf.value).toBe(200);
    expect(p.metrics.fcf.reliability).toBe("DERIVED");
  });
  it("ROIC uses derived tax rate", () => {
    // NOPAT = 300 * 0.8 = 240; invested = 400+500-100 = 800 -> 30%
    expect(p.metrics.roic.value).toBe(30);
    expect(p.metrics.roic.reliability).toBe("DERIVED");
  });
  it("ROE", () => expect(p.metrics.roe.value).toBe(40));
});

describe("computePacket — balance sheet, growth, dilution", () => {
  const p = fixturePacket();
  it("net debt and leverage", () => {
    expect(p.metrics.netDebt.value).toBe(300);
    expect(p.metrics.netDebtToEbitda.value).toBeCloseTo(0.86, 2);
  });
  it("CAGRs and YoY", () => {
    expect(p.metrics.revenueCagr3y.value).toBeCloseTo(25.99, 1);
    expect(p.metrics.revenueCagr5y.value).toBeCloseTo(20.11, 1);
    expect(p.metrics.revenueYoY.value).toBeCloseTo(11.11, 1);
  });
  it("share count change (buyback => negative)", () => {
    expect(p.metrics.shareCountChange3y.value).toBeCloseTo(-9.09, 1);
  });
});

describe("computePacket — valuation & history", () => {
  const p = fixturePacket();
  it("derives EV when not supplied", () => {
    expect(p.quote.enterpriseValue.value).toBe(5300);
    expect(p.quote.enterpriseValue.reliability).toBe("DERIVED");
  });
  it("multiples", () => {
    expect(p.valuation.pe.value).toBe(25);
    expect(p.valuation.evSales.value).toBe(5.3);
    expect(p.valuation.pFcf.value).toBe(25);
  });
  it("historical P/E range + percentile", () => {
    const r = p.multipleHistory.pe;
    expect(r.min).toBe(20);
    expect(r.max).toBe(30);
    expect(r.median).toBe(25);
    expect(r.percentile).toBe(67);
  });
});

describe("computePacket — reverse DCF integration", () => {
  it("computes implied growth with fixture inputs", () => {
    const p = fixturePacket();
    // marketCap 5000 / FCF 200 = 25x — implies meaningful growth at 10% disc.
    expect(p.reverseDcf.result).not.toBeNull();
    expect(p.reverseDcf.result!.impliedFcfCagrPct).toBeGreaterThan(0);
    expect(p.reverseDcf.result!.inputs.discountRatePct).toBe(10);
    expect(p.reverseDcf.reliability).toBe("PROXY"); // FCF was derived, not reported
  });
  it("respects the configurable discount rate", () => {
    const lo = fixturePacket({ discountRatePct: 8 });
    const hi = fixturePacket({ discountRatePct: 12 });
    // Higher discount rate -> the same price implies MORE growth.
    expect(hi.reverseDcf.result!.impliedFcfCagrPct).toBeGreaterThan(
      lo.reverseDcf.result!.impliedFcfCagrPct,
    );
  });
});

describe("computePacket — realized volatility", () => {
  it("computes vol from price history", () => {
    const p = fixturePacket();
    expect(p.metrics.realizedVol1yPct.value).toBeGreaterThan(5);
    expect(p.metrics.realizedVol1yPct.reliability).toBe("DERIVED");
  });
  it("MISSING without price history", () => {
    const p = fixturePacket({ priceHistory: [] });
    expect(p.metrics.realizedVol1yPct.value).toBeNull();
    expect(p.metrics.realizedVol1yPct.reliability).toBe("MISSING");
  });
});

describe("computePacket — staleness, proxy tax, completeness, discrepancies", () => {
  it("flags an old quote as STALE and warns", () => {
    const p = computePacket(
      fixtureInput({ now: new Date("2024-02-01T00:00:00.000Z") }),
    );
    expect(p.quote.price.reliability).toBe("STALE");
    expect(p.warnings.some((w) => w.includes("days old"))).toBe(true);
  });
  it("marks ROIC as PROXY when tax inputs missing", () => {
    const periods = FIXTURE_FINANCIALS.periods.map((p, i) =>
      i === 0 ? { ...p, pretaxIncome: undefined, incomeTax: undefined } : p,
    );
    const p = computePacket(
      fixtureInput({ financials: { ticker: "TEST", periods } }),
    );
    expect(p.metrics.roic.value).toBeCloseTo(29.63, 1); // 21% assumed tax
    expect(p.metrics.roic.reliability).toBe("PROXY");
  });
  it("sparse data => LOW completeness with missing list", () => {
    const p = computePacket({
      profile: { ticker: "X", name: "X" },
      financials: { ticker: "X", periods: [fy("2023-12-31", { revenue: 100 })] },
    });
    expect(p.completeness.level).toBe("LOW");
    expect(p.completeness.missing).toContain("pe");
  });
  it("discrepancies surface in the packet + warnings", () => {
    const p = fixturePacket({
      discrepancies: [
        {
          field: "revenue",
          fiscalDate: "2023-12-31",
          chosenProvider: "edgar",
          chosenValue: 1100,
          otherProvider: "fmp",
          otherValue: 1000,
          pctDiff: 9.09,
        },
      ],
    });
    expect(p.discrepancies).toHaveLength(1);
    expect(p.warnings.some((w) => w.includes("disagreement"))).toBe(true);
  });
});
