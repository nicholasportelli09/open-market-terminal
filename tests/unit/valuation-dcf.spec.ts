import { expect, test } from "@playwright/test";
import { expandSeries, runDcf, validateDcfInputs, type DcfInputs, type DcfSuccess } from "@/lib/valuation";

/**
 * Simple 3-year FCF-margin case, computed by hand:
 *   revenue  1000 -> 1100 -> 1210 -> 1331         (10 % growth)
 *   FCF      110, 121, 133.1                        (10 % margin)
 *   DF       1/1.1, 1/1.21, 1/1.331                 (wacc 10 %)
 *   PV       100, 100, 100            sumPv = 300
 *   TV       133.1 * 1.02 / (0.10 - 0.02) = 1697.025
 *   PV(TV)   1697.025 / 1.331 = 1275
 *   EV       300 + 1275 = 1575;  equity = 1575 - 100 = 1475;  per share = 1475 / 10 = 147.5
 *   TV share 1275 / 1575 = 0.8095238...
 */
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

function ok(inputs: DcfInputs): DcfSuccess {
  const r = runDcf(inputs);
  if (!r.ok) throw new Error(`expected ok, got ${r.errors.join("; ")}`);
  return r;
}

test("simple 3-year FCF-margin DCF matches the hand computation", () => {
  const r = ok(SIMPLE);
  expect(r.rows.map((x) => x.revenue)).toEqual([1100, 1210, expect.closeTo(1331, 9)]);
  r.rows.forEach((row, i) => {
    expect(row.year).toBe(i + 1);
    expect(row.fcf).toBeCloseTo([110, 121, 133.1][i], 9);
    expect(row.discountFactor).toBeCloseTo(1 / Math.pow(1.1, i + 1), 12);
    expect(row.pv).toBeCloseTo(100, 9);
    expect(row.ebit).toBeUndefined();
  });
  expect(r.sumPv).toBeCloseTo(300, 9);
  expect(r.terminalValue).toBeCloseTo(1697.025, 9);
  expect(r.pvTerminal).toBeCloseTo(1275, 9);
  expect(r.enterpriseValue).toBeCloseTo(1575, 9);
  expect(r.equityValue).toBeCloseTo(1475, 9);
  expect(r.perShare).toBeCloseTo(147.5, 9);
  expect(r.terminalShareOfEv).toBeCloseTo(1275 / 1575, 12);
  // 81 % of EV in the terminal value is above the 75 % flag.
  expect(r.warnings.some((w) => w.includes("Terminal value is 81 %"))).toBe(true);
});

test("mid-year convention shifts flows by half a year but discounts the terminal value at full N", () => {
  // PV_t = FCF_t / 1.1^(t - 0.5) = 100 * sqrt(1.1) each -> sumPv = 300 * sqrt(1.1) = 314.64265...
  // PV(TV) unchanged at 1275 -> EV = 1589.64265..., per share = (EV - 100) / 10 = 148.964265...
  const r = ok({ ...SIMPLE, midYear: true });
  expect(r.rows[0].discountFactor).toBeCloseTo(1 / Math.pow(1.1, 0.5), 12);
  expect(r.sumPv).toBeCloseTo(300 * Math.sqrt(1.1), 9);
  expect(r.pvTerminal).toBeCloseTo(1275, 9);
  expect(r.enterpriseValue).toBeCloseTo(1275 + 300 * Math.sqrt(1.1), 9);
  expect(r.perShare).toBeCloseTo(148.96426544510456, 9);
});

/**
 * Fundamental 3-year case with net cash and other adjustments, computed by hand:
 *   growth [0.10, 0.05] extends to 10 %, 5 %, 5 %; EBIT margin 20 %; tax 25 %; sales-to-capital 2; wacc 10 %; g 3 %
 *   Y1 revenue 1100     EBIT 220     NOPAT 165       reinvestment 100/2 = 50       FCF 115        PV 104.545454...
 *   Y2 revenue 1155     EBIT 231     NOPAT 173.25    reinvestment 55/2 = 27.5      FCF 145.75     PV 120.454545...
 *   Y3 revenue 1212.75  EBIT 242.55  NOPAT 181.9125  reinvestment 57.75/2 = 28.875 FCF 153.0375   PV 114.979338...
 *   sumPv 339.979338...
 *   Year 4 FCF = NOPAT_3 * 1.03 - 0.03 * 1212.75 / 2 = 187.369875 - 18.19125 = 169.178625 (reinvestment sized for g)
 *   TV = 169.178625 / 0.07 = 2416.8375;  PV(TV) = 2416.8375 / 1.331 = 1815.805785...
 *   EV = 2155.785123...;  equity = EV + 50 (net cash) - 10 (minority) = 2195.785123...
 *   per share = 2195.785123... / 100 = 21.957851...
 */
const FUNDAMENTAL: DcfInputs = {
  baseRevenue: 1000,
  years: 3,
  revenueGrowth: [0.1, 0.05],
  mode: "fundamental",
  ebitMargin: [0.2],
  taxRate: 0.25,
  salesToCapital: 2,
  wacc: 0.1,
  terminalGrowth: 0.03,
  netDebt: -50,
  sharesDiluted: 100,
  otherAdjustments: 10,
};

test("fundamental-mode DCF matches the hand computation", () => {
  const r = ok(FUNDAMENTAL);
  const expected = [
    { revenue: 1100, ebit: 220, nopat: 165, reinvestment: 50, fcf: 115, pv: 104.54545454545455 },
    { revenue: 1155, ebit: 231, nopat: 173.25, reinvestment: 27.5, fcf: 145.75, pv: 120.45454545454544 },
    { revenue: 1212.75, ebit: 242.55, nopat: 181.9125, reinvestment: 28.875, fcf: 153.0375, pv: 114.9793388429752 },
  ];
  r.rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(expected[i])) expect(row[k as keyof typeof row]).toBeCloseTo(v, 9);
  });
  expect(r.rows.map((x) => x.growth)).toEqual([0.1, 0.05, 0.05]);
  expect(r.sumPv).toBeCloseTo(339.9793388429752, 9);
  expect(r.terminalFcf).toBeCloseTo(169.178625, 9);
  expect(r.terminalValue).toBeCloseTo(2416.8375, 9);
  expect(r.pvTerminal).toBeCloseTo(2416.8375 / 1.331, 9);
  expect(r.enterpriseValue).toBeCloseTo(339.9793388429752 + 2416.8375 / 1.331, 9);
  expect(r.equityValue).toBeCloseTo(339.9793388429752 + 2416.8375 / 1.331 + 50 - 10, 9);
  expect(r.perShare).toBeCloseTo(21.95785123966942, 9);
});

// Incremental ROIC = 0.2 * (1 - 0.21) * 1.5 = 23.7 % against a 9 % WACC: growth creates value.
const GROWER: DcfInputs = {
  baseRevenue: 500,
  years: 7,
  revenueGrowth: [0],
  mode: "fundamental",
  ebitMargin: [0.2],
  taxRate: 0.21,
  salesToCapital: 1.5,
  wacc: 0.09,
  terminalGrowth: 0.025,
  netDebt: -30,
  sharesDiluted: 50,
};

test("fundamental mode: value rises with growth when ROIC > WACC and falls when ROIC < WACC", () => {
  const growths = [0, 0.05, 0.1, 0.15, 0.2, 0.3];
  const rich = growths.map((g) => ok({ ...GROWER, revenueGrowth: [g] }).perShare);
  for (let i = 1; i < rich.length; i++) expect(rich[i]).toBeGreaterThan(rich[i - 1]);
  // salesToCapital 0.4 -> ROIC = 0.2 * 0.79 * 0.4 = 6.3 % < 9 %: growth destroys value.
  const poor = growths.map((g) => ok({ ...GROWER, salesToCapital: 0.4, revenueGrowth: [g] }).perShare);
  for (let i = 1; i < poor.length; i++) expect(poor[i]).toBeLessThan(poor[i - 1]);
});

test("per-year arrays extend with their last value and ignore extra values", () => {
  expect(expandSeries([0.1, 0.05], 5)).toEqual([0.1, 0.05, 0.05, 0.05, 0.05]);
  expect(expandSeries([0.1, 0.2, 0.3, 0.4], 3)).toEqual([0.1, 0.2, 0.3]);
  const r = ok({ ...SIMPLE, years: 5, revenueGrowth: [0.2, 0.1], fcfMargin: [0.05, 0.1, 0.15] });
  expect(r.rows.map((x) => x.growth)).toEqual([0.2, 0.1, 0.1, 0.1, 0.1]);
  expect(r.rows[4].fcf).toBeCloseTo(1000 * 1.2 * 1.1 ** 4 * 0.15, 9);
});

test("net cash raises equity value and other adjustments lower it", () => {
  const base = ok(SIMPLE);
  expect(ok({ ...SIMPLE, netDebt: -100 }).equityValue).toBeCloseTo(base.enterpriseValue + 100, 9);
  expect(ok({ ...SIMPLE, otherAdjustments: 75 }).equityValue).toBeCloseTo(base.equityValue - 75, 9);
});

test("negative cash flows are returned as computed with warnings, never clamped", () => {
  const r = ok({ ...SIMPLE, fcfMargin: [-0.05] });
  expect(r.terminalValue).toBeLessThan(0);
  expect(r.perShare).toBeCloseTo((-1575 / 2 - 100) / 10, 9);
  expect(r.terminalShareOfEv).toBeNull();
  expect(r.warnings.length).toBeGreaterThanOrEqual(3);
});

test("validation rejects each bad input with a clear message", () => {
  const cases: Array<[Partial<DcfInputs>, string]> = [
    [{ wacc: 0.02 }, "must be greater than terminalGrowth"],
    [{ wacc: 0.01 }, "must be greater than terminalGrowth"],
    [{ sharesDiluted: 0 }, "sharesDiluted must be greater than 0"],
    [{ sharesDiluted: -5 }, "sharesDiluted must be greater than 0"],
    [{ years: 2 }, "years must be a whole number from 3 to 15"],
    [{ years: 16 }, "years must be a whole number from 3 to 15"],
    [{ years: 4.5 }, "years must be a whole number"],
    [{ baseRevenue: Number.NaN }, "baseRevenue must be a finite number"],
    [{ baseRevenue: 0 }, "baseRevenue must be greater than 0"],
    [{ netDebt: Number.POSITIVE_INFINITY }, "netDebt must be a finite number"],
    [{ fcfMargin: [0.1, 1.5] }, "fcfMargin[1] must be between -1 and 1"],
    [{ fcfMargin: [] }, "fcfMargin needs at least one value"],
    [{ fcfMargin: undefined }, "fcfMargin needs at least one value"],
    [{ revenueGrowth: [0.1, -1.2] }, "revenueGrowth[1] must be -1 or more"],
    [{ revenueGrowth: [Number.NaN] }, "revenueGrowth[0] must be a finite number"],
    [{ wacc: 0 }, "wacc must be greater than 0"],
    [{ terminalGrowth: -1 }, "terminalGrowth must be greater than -1"],
    [{ otherAdjustments: Number.NaN }, "otherAdjustments must be a finite number"],
  ];
  for (const [patch, message] of cases) {
    const r = runDcf({ ...SIMPLE, ...patch });
    expect(r.ok, JSON.stringify(patch)).toBe(false);
    if (!r.ok) expect(r.errors.join(" | ")).toContain(message);
  }
  expect(validateDcfInputs(SIMPLE)).toEqual({ ok: true });
  expect(validateDcfInputs({ ...SIMPLE, revenueGrowth: [-1] }).ok).toBe(true);
});

test("fundamental mode requires its own inputs", () => {
  const r = runDcf({ ...FUNDAMENTAL, ebitMargin: [1.2], taxRate: 1.5, salesToCapital: 0 });
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.errors).toHaveLength(3);
    expect(r.errors.join(" ")).toContain("ebitMargin[0] must be between -1 and 1");
    expect(r.errors.join(" ")).toContain("taxRate must be between 0 and 1");
    expect(r.errors.join(" ")).toContain("salesToCapital must be greater than 0");
  }
  const missing = runDcf({ ...FUNDAMENTAL, taxRate: undefined, salesToCapital: undefined });
  expect(missing.ok).toBe(false);
});

test("random inputs never produce NaN: either ok with finite numbers or ok:false", () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const pick = (lo: number, hi: number) => lo + (hi - lo) * rand();
  for (let i = 0; i < 2000; i++) {
    const inputs: DcfInputs = {
      baseRevenue: pick(-10, 1e6),
      years: Math.floor(pick(1, 18)),
      revenueGrowth: [pick(-1.5, 2), pick(-1.5, 2)],
      mode: rand() < 0.5 ? "fcfMargin" : "fundamental",
      fcfMargin: [pick(-1.2, 1.2)],
      ebitMargin: [pick(-1.2, 1.2)],
      taxRate: pick(-0.1, 1.1),
      salesToCapital: pick(-1, 5),
      wacc: pick(-0.05, 0.3),
      terminalGrowth: pick(-0.05, 0.1),
      netDebt: pick(-1e5, 1e5),
      sharesDiluted: pick(-10, 1000),
      midYear: rand() < 0.5,
    };
    const r = runDcf(inputs);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThan(0);
      continue;
    }
    const numbers = [r.sumPv, r.terminalValue, r.pvTerminal, r.enterpriseValue, r.equityValue, r.perShare];
    r.rows.forEach((row) => numbers.push(row.revenue, row.fcf, row.discountFactor, row.pv));
    expect(numbers.every(Number.isFinite)).toBe(true);
  }
});
