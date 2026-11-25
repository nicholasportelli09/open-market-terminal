import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSnapshot } from "@/lib/server/company-metrics";
import type { CompanyFactsRaw } from "@/lib/server/sec-facts";
import { normalizeFundamentals } from "@/lib/server/sec-fundamentals";
import { runDcf } from "@/lib/valuation";
import { addPeer, metricsFromSnapshot } from "@/components/valuation/comps";
import { friendlyError } from "@/components/valuation/errors";
import {
  buildInputs,
  computeWacc,
  fadeGrowth,
  initialLabState,
  sourcedEquity,
  startingCases,
  stateFromSaved,
  toScenarios,
  withMode,
  withTerminalGrowth,
  withYears,
} from "@/components/valuation/lab-model";
import { enterTarget } from "@/components/valuation/ticker-picker";
import { parseBeta, revenueHistoryRows, seedFromSnapshot } from "@/components/valuation/seed";

/** Real AAPL SEC companyfacts fixture (FY2026 10-K); the quote price is a test input for the arithmetic. */
function aapl() {
  const facts = JSON.parse(readFileSync(join(__dirname, "../fixtures/sec/aapl-companyfacts.json"), "utf8")) as CompanyFactsRaw;
  const r = normalizeFundamentals(facts);
  if (r.kind !== "ok") throw new Error(r.reason);
  const quote = { symbol: "AAPL", last: 300, currency: "USD", marketStatus: "POST_MKT", time: "2026-11-20", timeText: "11/20/26 EST" };
  return buildSnapshot("AAPL", r.base, { sic: "3571", sicDescription: "Electronic Computers", fiscalYearEnd: "0925", exchanges: ["Nasdaq"] }, quote);
}

test("seedFromSnapshot takes every seed from the snapshot, with its source", () => {
  const s = aapl();
  const seed = seedFromSnapshot(s);
  expect(seed.baseRevenue.value).toBe(478_834_000_000);
  expect(seed.baseRevenue.provenance).toMatchObject({ source: "sec", asOf: "2026-09-26" });
  expect(seed.baseRevenue.provenance.note).toBe("FY2026 (10-K)");
  expect(seed.sharesDiluted.value).toBe(14_532_182_000);
  expect(seed.netDebt.value).toBe(80_111_000_000 - 56_722_000_000);
  // Derived seeds borrow the SEC filing link of their inputs.
  expect(seed.netDebt.provenance.url).toContain("sec.gov");
  expect(seed.taxRate.value).toBeGreaterThan(0);
  expect(seed.taxRate.value).toBeLessThan(1);
  expect(seed.fcfMargin.value).toBeCloseTo((145_097_000_000 - 9_041_000_000) / 478_834_000_000, 6);
  expect(seed.ebitMargin.value).toBeCloseTo(158_063_000_000 / 478_834_000_000, 6);
  expect(seed.salesToCapital.value).toBeCloseTo(478_834_000_000 / (112_093_000_000 + 23_389_000_000), 6);
  expect(seed.startGrowth.label).toBe("3-year revenue CAGR");
  expect(seed.marketCap.value).toBeCloseTo(300 * 14_532_182_000, 0);
  expect(seed.currency).toBe("USD");
});

test("revenue history rows are oldest first with year-on-year growth", () => {
  const rows = revenueHistoryRows(aapl());
  expect(rows.at(-1)).toMatchObject({ fiscalYear: 2026, value: 478_834_000_000 });
  expect(rows.at(-1)?.growth).toBeCloseTo(478_834 / 416_161 - 1, 6);
  expect(rows[0].growth).toBeNull();
});

test("initial state builds valid engine inputs once the market inputs are present", () => {
  const seed = seedFromSnapshot(aapl());
  const state = initialLabState(seed);
  expect(state.years).toBe(5);
  expect(state.growth[0]).toBeCloseTo(seed.startGrowth.value as number, 9);
  expect(state.growth[4]).toBeCloseTo(state.terminalGrowth, 9);

  const noMarket = computeWacc(state, seed, { riskFree: null, beta: null });
  expect(noMarket.value).toBeNull();
  expect(noMarket.missing).toEqual(["risk-free rate", "beta"]);
  expect(buildInputs(state, seed, noMarket.value).missing).toContain("discount rate (WACC)");

  const w = computeWacc(state, seed, { riskFree: 0.045, beta: 1.1 });
  expect(w.costOfEquity).toBeCloseTo(0.045 + 1.1 * 0.05, 12);
  expect(w.value).not.toBeNull();
  const built = buildInputs(state, seed, w.value);
  expect(built.inputs).not.toBeNull();
  const dcf = runDcf(built.inputs!);
  expect(dcf.ok).toBe(true);
});

test("overrides, horizon changes, direct WACC and terminal growth", () => {
  const seed = seedFromSnapshot(aapl());
  const base = initialLabState(seed);
  const own = { ...base, overrides: { baseRevenue: 500e9 } };
  expect(buildInputs(own, seed, 0.09).inputs?.baseRevenue).toBe(500e9);

  const seven = withYears(base, seed, 7);
  expect(seven.growth).toHaveLength(7);
  expect(seven.fcfMargin).toHaveLength(7);
  expect(withYears(base, seed, 40).years).toBe(10);

  const direct = { ...base, wacc: { ...base.wacc, useDirect: true, direct: null } };
  expect(computeWacc(direct, seed, { riskFree: 0.04, beta: 1 }).missing).toEqual(["WACC"]);

  const g = withTerminalGrowth(base, seed, 0.03);
  expect(g.growth[4]).toBeCloseTo(0.03, 12);
  const edited = withTerminalGrowth({ ...base, growthEdited: true }, seed, 0.03);
  expect(edited.growth).toEqual(base.growth);
  expect(fadeGrowth(null, 0.02, 3)).toEqual([0.02, 0.02, 0.02]);
});

test("a saved model restores as state; matching seeds stay sourced", () => {
  const seed = seedFromSnapshot(aapl());
  const state = { ...initialLabState(seed), overrides: { netDebt: 1e9 } };
  const inputs = buildInputs(state, seed, 0.09).inputs!;
  const cases = startingCases(state, 0.09).map((c) => ({ ...c, weight: 1 / 3 }));
  const restored = stateFromSaved(
    { symbol: "AAPL", updatedAt: "2026-11-22T08:00:00.000Z", inputs, scenarios: toScenarios(cases, "fcfMargin"), result: { perShare: null, weighted: null, scenarioValues: { bear: null, base: null, bull: null }, priceAtSave: null, currency: "USD" } },
    seed,
  );
  expect(restored.overrides).toEqual({ netDebt: 1e9 });
  expect(restored.wacc).toMatchObject({ useDirect: true, direct: 0.09 });
  expect(restored.scenarios.find((s) => s.id === "bull")?.wacc).toBeCloseTo(0.08, 9);
  expect(restored.scenarios.find((s) => s.id === "base")?.growth).toBeNull();
});

test("comps metrics come from the snapshot and missing values are not invented", () => {
  const s = aapl();
  const m = metricsFromSnapshot(s);
  expect(m.price).toBe(300);
  expect(m.revenue).toBe(478_834_000_000);
  expect(metricsFromSnapshot(s, 310).price).toBe(310);
  expect(Number.isNaN(metricsFromSnapshot(s, null).price)).toBe(true);
  expect(Number.isNaN(metricsFromSnapshot({ ...s, currencyMismatch: true }).price)).toBe(true);

  expect(addPeer([], " msft ", "AAPL")).toEqual({ peers: ["MSFT"], error: null });
  expect(addPeer(["MSFT"], "msft", "AAPL").error).toContain("already");
  expect(addPeer([], "aapl", "AAPL").error).toContain("valuing");
  expect(addPeer(["A", "B", "C", "D", "E", "F", "G", "H"], "I", "AAPL").error).toContain("At most 8");
  expect(addPeer([], "$$$", "AAPL").error).not.toBeNull();
});

test("engine messages read in plain language and beta parses from CNBC strings", () => {
  expect(friendlyError("wacc (0.08) must be greater than terminalGrowth (0.09); the Gordon formula is undefined otherwise.")).toBe(
    "WACC (8%) must be higher than terminal growth (9%); the terminal value has no answer otherwise.",
  );
  expect(friendlyError("revenueGrowth[2] must be -1 or more (got -1.5).")).toBe("Revenue growth, year 3 must be -100% or more (got -150%).");
  expect(friendlyError("Weight for bear must be between 0 and 1 (got 1.5).")).toBe("Probability for bear must be between 0% and 100% (got 150%).");
  expect(friendlyError("something else")).toBe("something else");
  expect(parseBeta("1.06")).toBe(1.06);
  expect(parseBeta("")).toBeNull();
  expect(parseBeta("n/a")).toBeNull();
});

test("WACC builder: missing debt or equity can be entered, and a typed share count reaches the equity weight", () => {
  const s = aapl();
  const bank = seedFromSnapshot(s);
  const seed = { ...bank, marketCap: { ...bank.marketCap, value: null }, totalDebt: { ...bank.totalDebt, value: null, reason: "No debt figure" } };
  const state = initialLabState(seed);
  const market = { riskFree: 0.04, beta: 1 };
  expect(computeWacc(state, seed, market).missing).toEqual(["market value of equity", "debt"]);

  // Share count x live price fills equity; debt is a user field.
  const shares = { ...state, overrides: { sharesDiluted: 2150e6 } };
  const eq = sourcedEquity(shares, seed, 400);
  expect(eq).toEqual({ value: 2150e6 * 400, derived: true });
  const typed = { ...shares, wacc: { ...shares.wacc, debtValue: 0 } };
  const w = computeWacc(typed, seed, { ...market, equity: eq.value });
  expect(w.missing).toEqual([]);
  expect(w.equityWeight).toBe(1);
  expect(w.value).toBeCloseTo(0.04 + 0.05, 12);

  // An override of equity value wins; without a price or share count nothing is invented.
  expect(computeWacc({ ...typed, wacc: { ...typed.wacc, equityValue: 1e12 } }, seed, { ...market, equity: null }).equityValue).toBe(1e12);
  expect(sourcedEquity(state, { ...seed, sharesDiluted: { ...seed.sharesDiluted, value: null } }, 400).value).toBeNull();
  // With a market cap seed and no share override the seed is used, not the live price.
  expect(sourcedEquity(initialLabState(bank), bank, 999)).toEqual({ value: bank.marketCap.value, derived: false });
});

test("switching the cash flow method clears scenario margin overrides only", () => {
  const seed = seedFromSnapshot(aapl());
  const filled = { ...initialLabState(seed), scenarios: startingCases(initialLabState(seed), 0.09) };
  const switched = withMode(filled, "fundamental");
  expect(switched.mode).toBe("fundamental");
  expect(switched.scenarios.every((d) => d.margin === null)).toBe(true);
  expect(switched.scenarios.find((d) => d.id === "bear")?.growth).toBe(filled.scenarios.find((d) => d.id === "bear")?.growth);
  expect(withMode(filled, "fcfMargin")).toBe(filled);
});

test("tax rate and sales-to-capital overrides survive a save in FCF mode", () => {
  const seed = seedFromSnapshot(aapl());
  const state = { ...initialLabState(seed), overrides: { taxRate: 0.21, salesToCapital: 2.5 } };
  const inputs = buildInputs(state, seed, 0.09).inputs!;
  expect(inputs.mode).toBe("fcfMargin");
  expect(inputs).toMatchObject({ taxRate: 0.21, salesToCapital: 2.5 });
  expect(runDcf(inputs).ok).toBe(true);
  const empty = { perShare: null, weighted: null, scenarioValues: { bear: null, base: null, bull: null }, priceAtSave: null, currency: "USD" };
  const restored = stateFromSaved({ symbol: "AAPL", updatedAt: "2026-11-22T08:00:00.000Z", inputs, scenarios: [], result: empty }, seed);
  expect(restored.overrides).toEqual({ taxRate: 0.21, salesToCapital: 2.5 });
});

test("Enter opens the matching suggestion for a company name, the typed text for a ticker", () => {
  const apple = [
    { symbol: "AAPL", name: "Apple Inc", type: "STOCK", exchange: "NASDAQ" },
    { symbol: "APLE", name: "Apple Hospitality REIT", type: "STOCK", exchange: "NYSE" },
  ];
  expect(enterTarget("apple", "apple", apple)).toBe("AAPL");
  expect(enterTarget("aple", "aple", apple)).toBe("aple");
  expect(enterTarget("apple", "appl", apple)).toBe("apple");
  expect(enterTarget("XYZQ", "XYZQ", apple)).toBe("XYZQ");
  expect(enterTarget("msft", "msft", [])).toBe("msft");
});
