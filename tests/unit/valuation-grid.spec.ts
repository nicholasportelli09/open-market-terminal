import { expect, test } from "@playwright/test";
import { centeredRange, MAX_AXIS_LENGTH, runDcf, runScenarios, sensitivityGrid, type DcfInputs, type Scenario } from "@/lib/valuation";

// Same simple case as valuation-dcf.spec.ts: per share 147.5 at wacc 10 %, g 2 %.
const SIMPLE: DcfInputs = {
  baseRevenue: 1000,
  years: 3,
  revenueGrowth: [0.1],
  mode: "fcfMargin",
  fcfMargin: [0.1],
  wacc: 0.1,
  terminalGrowth: 0.02,
  netDebt: 100,
  sharesDiluted: 10,
};

test("centeredRange builds clean, symmetric axes", () => {
  expect(centeredRange(0.1, 0.02, 0.005)).toEqual([0.08, 0.085, 0.09, 0.095, 0.1, 0.105, 0.11, 0.115, 0.12]);
  expect(centeredRange(0.02, 0.01, 0.005)).toEqual([0.01, 0.015, 0.02, 0.025, 0.03]);
  expect(centeredRange(0.07, 0, 0.01)).toEqual([0.07]);
  expect(centeredRange(0.1, 0.02, 0)).toEqual([]);
  expect(centeredRange(Number.NaN, 0.02, 0.005)).toEqual([]);
  expect(centeredRange(0.1, -0.02, 0.005)).toEqual([]);
});

test("centeredRange and sensitivityGrid cap their size instead of hanging or throwing", () => {
  expect(centeredRange(0.1, 0.05, 0.001)).toHaveLength(MAX_AXIS_LENGTH);
  expect(centeredRange(0.1, 0.051, 0.001)).toEqual([]);
  expect(centeredRange(0.1, 0.02, 1e-9)).toEqual([]);
  expect(() => centeredRange(0.1, 1e6, 1e-9)).not.toThrow();
  expect(centeredRange(0.1, 1e6, 1e-9)).toEqual([]);
  expect(centeredRange(0.1, 1e308, 1e-308)).toEqual([]);
  const long = Array.from({ length: MAX_AXIS_LENGTH + 1 }, (_, i) => 0.05 + i * 1e-4);
  const r = sensitivityGrid(SIMPLE, { waccValues: long, growthValues: [0.02] });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.join(" ")).toContain(`at most ${MAX_AXIS_LENGTH}`);
  expect(sensitivityGrid(SIMPLE, { waccValues: [0.1], growthValues: long.map((x) => x - 0.05) }).ok).toBe(false);
});

test("sensitivity centre cell equals runDcf per share exactly", () => {
  const waccValues = centeredRange(SIMPLE.wacc, 0.02, 0.005);
  const growthValues = centeredRange(SIMPLE.terminalGrowth, 0.01, 0.005);
  const grid = sensitivityGrid(SIMPLE, { waccValues, growthValues });
  expect(grid.ok).toBe(true);
  if (!grid.ok) return;
  const base = runDcf(SIMPLE);
  expect(base.ok && grid.values[4][2]).toBe(base.ok ? base.perShare : NaN);
  expect(grid.values[4][2]).toBeCloseTo(147.5, 9);
  expect(grid.values).toHaveLength(9);
  grid.values.forEach((row) => expect(row).toHaveLength(5));
});

test("value falls as WACC rises and rises with terminal growth (positive cash flows)", () => {
  const grid = sensitivityGrid(SIMPLE, { waccValues: [0.08, 0.1, 0.12], growthValues: [0.01, 0.02, 0.03] });
  if (!grid.ok) throw new Error("grid failed");
  const v = grid.values as number[][];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i > 0) expect(v[i][j]).toBeLessThan(v[i - 1][j]);
      if (j > 0) expect(v[i][j]).toBeGreaterThan(v[i][j - 1]);
    }
  }
});

test("cells where wacc <= g are null, never NaN or Infinity", () => {
  const grid = sensitivityGrid(SIMPLE, { waccValues: [0.02, 0.03, 0.05], growthValues: [0.02, 0.03] });
  if (!grid.ok) throw new Error("grid failed");
  expect(grid.values[0]).toEqual([null, null]);
  expect(grid.values[1][0]).not.toBeNull();
  expect(grid.values[1][1]).toBeNull();
  grid.values.flat().forEach((x) => expect(x === null || Number.isFinite(x)).toBe(true));
});

test("grid works even when the base wacc / g pair is itself invalid, but not with other bad inputs", () => {
  expect(sensitivityGrid({ ...SIMPLE, wacc: 0.01 }, { waccValues: [0.09], growthValues: [0.02] }).ok).toBe(true);
  const bad = sensitivityGrid({ ...SIMPLE, sharesDiluted: 0 }, { waccValues: [0.09], growthValues: [0.02] });
  expect(bad.ok).toBe(false);
  expect(sensitivityGrid(SIMPLE, { waccValues: [], growthValues: [0.02] }).ok).toBe(false);
  expect(sensitivityGrid(SIMPLE, { waccValues: [0.1], growthValues: [Number.NaN] }).ok).toBe(false);
});

/**
 * Scenarios on SIMPLE (EV is linear in the FCF margin: EV = 15750 * margin, equity = EV - 100, 10 shares):
 *   bear margin 5 %  -> EV 787.5,  per share 68.75
 *   base margin 10 % -> EV 1575,   per share 147.5
 *   bull margin 20 % -> EV 3150,   per share 305
 *   weighted (0.25 / 0.5 / 0.25) = 17.1875 + 73.75 + 76.25 = 167.1875; at price 125 upside = 0.3375
 */
const SCENARIOS: Scenario[] = [
  { id: "bear", label: "Bear", overrides: { fcfMargin: [0.05] }, weight: 0.25 },
  { id: "base", label: "Base", overrides: {}, weight: 0.5 },
  { id: "bull", label: "Bull", overrides: { fcfMargin: [0.2], wacc: undefined }, weight: 0.25 },
];

test("scenarios: per-case values, upside and the user-weighted value match the hand computation", () => {
  const r = runScenarios(SIMPLE, SCENARIOS, 125);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.scenarios.map((s) => s.perShare)).toEqual([expect.closeTo(68.75, 9), expect.closeTo(147.5, 9), expect.closeTo(305, 9)]);
  expect(r.scenarios[0].upside).toBeCloseTo(68.75 / 125 - 1, 12);
  expect(r.weighted.ok).toBe(true);
  if (r.weighted.ok) {
    expect(r.weighted.value).toBeCloseTo(167.1875, 9);
    expect(r.weighted.upside).toBeCloseTo(0.3375, 9);
  }
});

test("scenarios: weights that do not sum to 1 give no weighted value", () => {
  const r = runScenarios(SIMPLE, SCENARIOS.map((s) => ({ ...s, weight: 0.3 })), 125);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.weighted.ok).toBe(false);
    if (!r.weighted.ok) expect(r.weighted.message).toContain("add up to 0.9");
    expect(r.scenarios.every((s) => s.perShare !== null)).toBe(true);
  }
  // Float noise within 1e-9 is accepted: 0.1 + 0.2 + 0.7 = 1.0000000000000002.
  const close = runScenarios(SIMPLE, SCENARIOS.map((s, i) => ({ ...s, weight: [0.1, 0.2, 0.7][i] })), 125);
  expect(close.ok && close.weighted.ok).toBe(true);
});

test("scenarios: an invalid case keeps its errors and blocks only the weighted value", () => {
  const withBad = [SCENARIOS[0], { ...SCENARIOS[1], overrides: { wacc: 0.01 } }, SCENARIOS[2]];
  const r = runScenarios(SIMPLE, withBad, 125);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.scenarios[1].perShare).toBeNull();
  expect(r.scenarios[1].result.ok).toBe(false);
  expect(r.weighted.ok).toBe(false);
});

test("scenarios: missing price leaves upside null; bad price, weights or ids are rejected", () => {
  const noPrice = runScenarios(SIMPLE, SCENARIOS, null);
  expect(noPrice.ok).toBe(true);
  if (noPrice.ok) {
    expect(noPrice.scenarios.every((s) => s.upside === null)).toBe(true);
    expect(noPrice.weighted.ok && noPrice.weighted.upside).toBeNull();
  }
  expect(runScenarios(SIMPLE, SCENARIOS, 0).ok).toBe(false);
  expect(runScenarios(SIMPLE, SCENARIOS, Number.NaN).ok).toBe(false);
  expect(runScenarios(SIMPLE, [], 125).ok).toBe(false);
  expect(runScenarios(SIMPLE, [SCENARIOS[0], SCENARIOS[0]], 125).ok).toBe(false);
  expect(runScenarios(SIMPLE, [{ ...SCENARIOS[0], weight: -0.1 }], 125).ok).toBe(false);
});
