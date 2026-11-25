import { expect, test } from "@playwright/test";
import { DEFAULT_WEIGHTS, type FactorId, type Weights } from "@/lib/scanner/factors";
import { compositeScore, percentileRanks, sanitizeWeights, scoreUniverse, type FactorScore, type ScoringInput } from "@/lib/scanner/scoring";
import { filterView, sortView, buildView, DEFAULT_FILTERS } from "@/lib/scanner/view";
import type { ScanMetric, ScanMetricKey, ScreenRow } from "@/lib/scanner/types";
import { DERIVED_KEYS, SNAPSHOT_KEYS } from "@/lib/scanner/types";

test.describe("percentileRanks", () => {
  test("ranks 0..100 evenly, higher is better", () => {
    expect(percentileRanks([10, 20, 30, 40, 50])).toEqual([0, 25, 50, 75, 100]);
  });

  test("ties share the average rank", () => {
    // sorted: 1, 2, 2, 3 -> positions 0, 1, 2, 3; the two 2s average (1 + 2) / 2 = 1.5 of 3
    expect(percentileRanks([2, 1, 3, 2])).toEqual([50, 0, 100, 50]);
    expect(percentileRanks([5, 5, 5])).toEqual([50, 50, 50]);
  });

  test("nulls stay null and are not counted as peers", () => {
    expect(percentileRanks([null, 10, undefined, 30, NaN])).toEqual([null, 0, null, 100, null]);
  });

  test("inverse metrics flip the scale", () => {
    expect(percentileRanks([10, 20, 30], "low")).toEqual([100, 50, 0]);
  });

  test("a single value ranks 50", () => {
    expect(percentileRanks([null, 7])).toEqual([null, 50]);
  });
});

function input(symbol: string, values: ScoringInput["values"], financial = false): ScoringInput {
  return { symbol, financial, values };
}

const FULL = (pe: number, fcfYield: number, growth: number): ScoringInput["values"] => ({
  pe, fcfYield, evToEbit: pe * 0.8,
  roic: 0.2, operatingMarginTTM: 0.3, fcfMarginTTM: 0.2, debtToEquity: 0.5, interestCoverage: 20,
  revenueGrowthTTM: growth, revenueCagr3y: growth,
  earningsWithin30d: 0, filings8k30d: 1,
  volatility1y: 0.25, maxDrawdown1y: 0.15, beta: 1,
});

test.describe("scoreUniverse", () => {
  const rows = [input("A", FULL(10, 0.08, 0.02)), input("B", FULL(20, 0.04, 0.1)), input("C", FULL(30, 0.02, 0.2))];

  test("value rewards low P/E, low EV/EBIT and high FCF yield", () => {
    const [a, b, c] = scoreUniverse(rows, DEFAULT_WEIGHTS);
    expect(a.factors.value.score).toBe(100);
    expect(b.factors.value.score).toBe(50);
    expect(c.factors.value.score).toBe(0);
    expect(a.factors.value.used.map((u) => u.key).sort()).toEqual(["evToEbit", "fcfYield", "pe"]);
  });

  test("growth is the mean of TTM growth and 3y CAGR percentiles", () => {
    const [a, , c] = scoreUniverse(rows, DEFAULT_WEIGHTS);
    expect(a.factors.growth.score).toBe(0);
    expect(c.factors.growth.score).toBe(100);
  });

  test("null metrics are excluded (never imputed); a factor needs 2 metrics", () => {
    const sparse = [...rows, input("D", { ...FULL(15, 0.05, 0.05), revenueCagr3y: null })];
    const d = scoreUniverse(sparse, DEFAULT_WEIGHTS)[3];
    expect(d.factors.growth.score).toBeNull();
    expect(d.factors.growth.used).toHaveLength(1);
    expect(d.factors.growth.missing).toEqual(["revenueCagr3y"]);
    // Peers on CAGR are only the three companies that report it.
    const c = scoreUniverse(sparse, DEFAULT_WEIGHTS)[2];
    expect(c.factors.growth.used.find((u) => u.key === "revenueCagr3y")?.peers).toBe(3);
  });

  test("financial companies use P/E and P/B for value and skip EV metrics", () => {
    const bank = input("BANK", { pe: 12, priceToBook: 1.2, evToEbit: 5, fcfYield: 0.3, roe: 0.12 }, true);
    const bank2 = input("BNK2", { pe: 15, priceToBook: 2, roe: 0.1 }, true);
    const [b1, b2] = scoreUniverse([bank, bank2, ...rows], DEFAULT_WEIGHTS);
    expect(b1.factors.value.used.map((u) => u.key).sort()).toEqual(["pe", "priceToBook"]);
    expect(b1.factors.value.score).toBeGreaterThan(b2.factors.value.score as number);
    // Quality has only ROE for these banks: fewer than 2 metrics, so no score.
    expect(b1.factors.quality.score).toBeNull();
  });

  test("composite needs 3 factors, else insufficient data", () => {
    const thin = input("T", { pe: 10, fcfYield: 0.05, revenueGrowthTTM: 0.1, revenueCagr3y: 0.1 });
    const out = scoreUniverse([...rows, thin], DEFAULT_WEIGHTS)[3];
    expect(out.composite.ok).toBe(false);
    if (!out.composite.ok) expect(out.composite.reason).toContain("2 of 5");
  });
});

const fs = (id: FactorId, score: number | null): FactorScore => ({ id, score, used: [], missing: [] });
const factors = (v: number | null, q: number | null, g: number | null, c: number | null, r: number | null) => ({
  value: fs("value", v), quality: fs("quality", q), growth: fs("growth", g), catalysts: fs("catalysts", c), risk: fs("risk", r),
});

test.describe("compositeScore weights", () => {
  test("equal weights give the plain mean of available factors", () => {
    const c = compositeScore(factors(80, 60, 40, null, 20), DEFAULT_WEIGHTS);
    expect(c.ok && c.value).toBe(50);
  });

  test("user weights shift the composite", () => {
    const w: Weights = { value: 100, quality: 0, growth: 0, catalysts: 0, risk: 0 };
    const c = compositeScore(factors(80, 60, 40, null, 20), w);
    expect(c.ok && c.value).toBe(80);
    expect(c.factorsUsed).toEqual(["value"]);
    const w2: Weights = { value: 30, quality: 10, growth: 0, catalysts: 50, risk: 10 };
    const c2 = compositeScore(factors(80, 60, 40, null, 20), w2);
    expect(c2.ok && c2.value).toBeCloseTo((30 * 80 + 10 * 60 + 10 * 20) / 50, 10);
  });

  test("all-zero weights on available factors give no composite", () => {
    const c = compositeScore(factors(80, 60, 40, null, null), { value: 0, quality: 0, growth: 0, catalysts: 100, risk: 100 });
    expect(c.ok).toBe(false);
  });

  test("sanitizeWeights clamps and rounds", () => {
    expect(sanitizeWeights({ value: 150, quality: -5, growth: 12.6, catalysts: "x", risk: 20 }, DEFAULT_WEIGHTS)).toEqual({
      value: 100, quality: 0, growth: 13, catalysts: 20, risk: 20,
    });
    expect(sanitizeWeights(null, DEFAULT_WEIGHTS)).toEqual(DEFAULT_WEIGHTS);
  });
});

function screenRow(symbol: string, values: Partial<Record<ScanMetricKey, number | null>>, sector = "Tech"): ScreenRow {
  const metric = (v: number | null | undefined): ScanMetric => ({ value: v ?? null, unit: "fraction", formula: "", provenance: { source: "sec", asOf: "2026-09-30" } });
  const metrics = Object.fromEntries([...SNAPSHOT_KEYS, ...DERIVED_KEYS].map((k) => [k, metric(values[k])])) as ScreenRow["metrics"];
  return {
    symbol, name: `${symbol} Inc`, cik: "0", sector, sic: null, sicDescription: null, financialCompany: false, currency: "USD", currencyMismatch: false,
    price: { value: 100, unit: "per_share", formula: "", provenance: { source: "cnbc", asOf: "" } }, metrics, catalysts: [], ttmPeriodEnd: null, warnings: [], extra: false,
  };
}

test.describe("table view", () => {
  const rows = [
    screenRow("AAA", { ...FULL(10, 0.08, 0.02), marketCap: 2e12 }),
    screenRow("BBB", { ...FULL(20, 0.04, 0.1), marketCap: 3e11 }, "Health"),
    screenRow("CCC", { ...FULL(30, 0.02, 0.2), marketCap: null }),
  ];

  test("ranks by composite and filters by sector, size and score", () => {
    const view = buildView(rows, { value: 100, quality: 0, growth: 0, catalysts: 0, risk: 0 });
    expect(view.map((v) => v.rank)).toEqual([1, 2, 3]);
    expect(filterView(view, { ...DEFAULT_FILTERS, sector: "Health" }).map((v) => v.row.symbol)).toEqual(["BBB"]);
    expect(filterView(view, { ...DEFAULT_FILTERS, minMarketCap: 1e12 }).map((v) => v.row.symbol)).toEqual(["AAA"]);
    expect(filterView(view, { ...DEFAULT_FILTERS, minScore: 50, scoreOf: "value" }).map((v) => v.row.symbol)).toEqual(["AAA", "BBB"]);
    expect(filterView(view, { ...DEFAULT_FILTERS, query: "ccc" }).map((v) => v.row.symbol)).toEqual(["CCC"]);
  });

  test("sorting keeps missing values last in both directions", () => {
    const view = buildView(rows, DEFAULT_WEIGHTS);
    expect(sortView(view, { key: "marketCap", dir: "desc" }).map((v) => v.row.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(sortView(view, { key: "marketCap", dir: "asc" }).map((v) => v.row.symbol)).toEqual(["BBB", "AAA", "CCC"]);
  });
});
