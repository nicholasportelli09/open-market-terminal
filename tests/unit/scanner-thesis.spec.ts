import { expect, test } from "@playwright/test";
import { validateScenarios, valueScenarios, evidenceFrom, type DcfBase } from "@/lib/scanner/thesis";
import type { AnalystAnswer } from "@/lib/ai/types";

const EVIDENCE = new Set(["E1", "E2", "E3"]);

const scenario = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  revenueGrowth: [0.1, 0.1, 0.1, 0.1, 0.1],
  fcfMargin: [0.1, 0.1, 0.1, 0.1, 0.1],
  terminalGrowth: 0.02,
  wacc: 0.1,
  rationale: "Growth holds near the reported TTM rate [E1].",
  evidence: ["E1", "e2"],
  ...over,
});

const THREE = { scenarios: [scenario("bear"), scenario("base"), scenario("bull")] };

test.describe("validateScenarios", () => {
  test("accepts three in-range sets and normalises evidence ids", () => {
    const r = validateScenarios(THREE, EVIDENCE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scenarios.map((s) => s.id)).toEqual(["bear", "base", "bull"]);
      expect(r.scenarios[0].evidence).toEqual(["E1", "E2"]);
    }
  });

  test("a repeated valid evidence id is de-duplicated without a warning", () => {
    const r = validateScenarios({ scenarios: [scenario("bear", { evidence: ["E1", "e1"] }), scenario("base"), scenario("bull")] }, EVIDENCE);
    expect(r.ok && r.scenarios[0].evidence).toEqual(["E1"]);
    expect(r.ok && r.warnings).toEqual([]);
  });

  test("drops unknown evidence ids with a warning", () => {
    const r = validateScenarios({ scenarios: [scenario("bear", { evidence: ["E9", "E1"] }), scenario("base"), scenario("bull")] }, EVIDENCE);
    expect(r.ok && r.scenarios[0].evidence).toEqual(["E1"]);
    expect(r.ok && r.warnings[0]).toContain("unknown evidence");
  });

  const bad: [string, Record<string, unknown>, string][] = [
    ["growth above +60%", { revenueGrowth: [0.7, 0.1, 0.1, 0.1, 0.1] }, "revenue growth year 1"],
    ["growth below -50%", { revenueGrowth: [0.1, -0.6, 0.1, 0.1, 0.1] }, "revenue growth year 2"],
    ["margin above +60%", { fcfMargin: [0.1, 0.1, 0.1, 0.1, 0.65] }, "FCF margin year 5"],
    ["wrong path length", { fcfMargin: [0.1, 0.1] }, "exactly 5"],
    ["WACC below 5%", { wacc: 0.04 }, "WACC"],
    ["WACC above 15%", { wacc: 0.16 }, "WACC"],
    ["terminal growth above 4%", { terminalGrowth: 0.045 }, "at most 4%"],
    ["terminal growth not below WACC", { terminalGrowth: 0.04, wacc: 0.04 }, "WACC"],
    ["missing rationale", { rationale: " " }, "rationale"],
  ];
  for (const [name, over, msg] of bad) {
    test(`rejects ${name}`, () => {
      const r = validateScenarios({ scenarios: [scenario("bear", over), scenario("base"), scenario("bull")] }, EVIDENCE);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toContain(msg);
    });
  }

  test("terminal growth equal to WACC is rejected even inside the 4% cap", () => {
    const r = validateScenarios({ scenarios: [scenario("bear", { terminalGrowth: 0.05, wacc: 0.05 }), scenario("base"), scenario("bull")] }, EVIDENCE);
    expect(r.ok).toBe(false);
  });

  test("needs exactly one of each id", () => {
    expect(validateScenarios({ scenarios: [scenario("bear"), scenario("bear"), scenario("bull")] }, EVIDENCE).ok).toBe(false);
    expect(validateScenarios({ scenarios: [] }, EVIDENCE).ok).toBe(false);
    expect(validateScenarios(null, EVIDENCE).ok).toBe(false);
  });
});

/**
 * Fixture valued by hand (5 years, 10% growth, 10% FCF margin, WACC 10%, g 2%):
 *   revenue 1100, 1210, 1331, 1464.1, 1610.51; FCF = 10% of that; each PV = 100 -> sumPv = 500
 *   TV = 161.051 * 1.02 / 0.08 = 2053.40025; PV(TV) = 2053.40025 / 1.61051 = 1275
 *   EV = 1775; equity = 1775 - 100 = 1675; per share = 167.5
 */
const BASE: DcfBase = {
  revenueTTM: 1000,
  netDebt: 100,
  shares: 10,
  currency: "USD",
  provenance: { revenueTTM: { source: "sec", asOf: "2026-09-30" }, netDebt: { source: "sec", asOf: "2026-09-30" }, shares: { source: "sec", asOf: "2026-10-20" } },
};

test.describe("valueScenarios", () => {
  test("computes fair value, return potential and margin of safety from the snapshot base", () => {
    const r = validateScenarios(THREE, EVIDENCE);
    if (!r.ok) throw new Error(r.errors.join("; "));
    const [bear] = valueScenarios(BASE, r.scenarios, 134);
    expect(bear.perShare).toBeCloseTo(167.5, 9);
    expect(bear.enterpriseValue).toBeCloseTo(1775, 9);
    expect(bear.returnPotential).toBeCloseTo(167.5 / 134 - 1, 9);
    expect(bear.marginOfSafety).toBeCloseTo(1 - 134 / 167.5, 9);
    expect(bear.errors).toEqual([]);
  });

  test("no price means no return potential, but the fair value stands", () => {
    const r = validateScenarios(THREE, EVIDENCE);
    if (!r.ok) throw new Error("invalid");
    const [s] = valueScenarios(BASE, r.scenarios, null);
    expect(s.perShare).toBeCloseTo(167.5, 9);
    expect(s.returnPotential).toBeNull();
    expect(s.marginOfSafety).toBeNull();
  });

  test("higher WACC lowers the value", () => {
    const r = validateScenarios({ scenarios: [scenario("bear", { wacc: 0.12 }), scenario("base"), scenario("bull", { wacc: 0.08 })] }, EVIDENCE);
    if (!r.ok) throw new Error("invalid");
    const [bear, base, bull] = valueScenarios(BASE, r.scenarios, 100);
    expect(bear.perShare as number).toBeLessThan(base.perShare as number);
    expect(bull.perShare as number).toBeGreaterThan(base.perShare as number);
  });
});

test("evidenceFrom numbers claims across sections", () => {
  const answer: AnalystAnswer = {
    sections: [
      { heading: "Business summary", claims: [{ kind: "fact", text: "a", refs: ["S1"] }] },
      { heading: "Evidence for", claims: [{ kind: "estimate", text: "b", refs: [] }, { kind: "interpretation", text: "c", refs: [] }] },
    ],
    citations: [], model: "m", generatedAt: "", usedWebSearch: false, warnings: [],
  };
  expect(evidenceFrom(answer).map((e) => `${e.id}:${e.section}:${e.kind}`)).toEqual([
    "E1:Business summary:fact", "E2:Evidence for:estimate", "E3:Evidence for:interpretation",
  ]);
});
