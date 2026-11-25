import { expect, test } from "@playwright/test";
import { impliedGrowth, impliedMargin, impliedWacc, runDcf, solveMonotonic, type DcfInputs } from "@/lib/valuation";

// Same simple case as valuation-dcf.spec.ts: per share 147.5.
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

const FUNDAMENTAL: DcfInputs = {
  baseRevenue: 5000,
  years: 10,
  revenueGrowth: [0.08],
  mode: "fundamental",
  ebitMargin: [0.18],
  taxRate: 0.21,
  salesToCapital: 2.5,
  wacc: 0.09,
  terminalGrowth: 0.025,
  netDebt: 1200,
  sharesDiluted: 400,
  midYear: true,
};

function priceOf(inputs: DcfInputs): number {
  const r = runDcf(inputs);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.perShare;
}

test("reverse DCF of the DCF's own price returns the input growth (fcfMargin mode)", () => {
  for (const g of [-0.3, -0.05, 0, 0.04, 0.1, 0.25, 0.6]) {
    const inputs = { ...SIMPLE, years: 7, revenueGrowth: [g] };
    const r = impliedGrowth(inputs, priceOf(inputs));
    expect(r.ok, `g=${g}`).toBe(true);
    if (r.ok) {
      expect(Math.abs(r.growth - g)).toBeLessThan(1e-6);
      expect(r.monotonic).toBe(true);
    }
  }
});

test("reverse DCF of the DCF's own price returns the input growth (fundamental mode, default range)", () => {
  // Terminal reinvestment is sized for terminal growth, so with ROIC > WACC value rises with growth and the
  // default [-0.5, 1] range has one root.
  const GROWER: DcfInputs = {
    ...FUNDAMENTAL,
    baseRevenue: 500,
    years: 7,
    ebitMargin: [0.2],
    salesToCapital: 1.5,
    netDebt: -30,
    sharesDiluted: 50,
    midYear: false,
  };
  for (const base of [FUNDAMENTAL, GROWER]) {
    for (const g of [-0.1, 0.02, 0.03, 0.05, 0.08, 0.15, 0.3]) {
      const inputs = { ...base, revenueGrowth: [g] };
      const r = impliedGrowth(inputs, priceOf(inputs));
      expect(r.ok, `g=${g}`).toBe(true);
      if (r.ok) {
        expect(Math.abs(r.growth - g)).toBeLessThan(1e-6);
        expect(r.monotonic).toBe(true);
      }
    }
  }
  // An inverted search range is rejected.
  expect(impliedGrowth(FUNDAMENTAL, 30, { lo: 0.3, hi: 0.1 }).ok).toBe(false);
});

test("implied margin matches the closed form in the linear fcfMargin case", () => {
  // In SIMPLE, EV = 15750 * margin, so per share = (15750 m - 100) / 10.
  // Target 147.5 -> m = 0.10; target 300 -> m = 3100 / 15750 = 0.196825396825...
  const a = impliedMargin(SIMPLE, 147.5);
  const b = impliedMargin(SIMPLE, 300);
  expect(a.ok && Math.abs(a.margin - 0.1) < 1e-9).toBe(true);
  expect(b.ok && Math.abs(b.margin - 3100 / 15750) < 1e-9).toBe(true);
});

test("implied EBIT margin round-trips in fundamental mode", () => {
  const inputs = { ...FUNDAMENTAL, ebitMargin: [0.23] };
  const r = impliedMargin(inputs, priceOf(inputs));
  expect(r.ok).toBe(true);
  if (r.ok) expect(Math.abs(r.margin - 0.23)).toBeLessThan(1e-6);
});

test("implied WACC round-trips", () => {
  for (const w of [0.06, 0.1, 0.14]) {
    const inputs = { ...FUNDAMENTAL, wacc: w };
    const r = impliedWacc(inputs, priceOf(inputs));
    expect(r.ok, `w=${w}`).toBe(true);
    if (r.ok) expect(Math.abs(r.wacc - w)).toBeLessThan(1e-6);
  }
});

test("unreachable targets report no solution and the reachable range", () => {
  const r = impliedGrowth(SIMPLE, 1e9);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toBe("no solution in range");
    expect(r.reachable?.max).toBeLessThan(1e9);
    expect(r.reachable?.min).toBeLessThan(r.reachable?.max ?? 0);
  }
  const m = impliedMargin(SIMPLE, 1e7);
  expect(m.ok).toBe(false);
  if (!m.ok) expect(m.reason).toBe("no solution in range");
});

test("negative margins make value fall with growth and the solver still finds the root", () => {
  const inputs = { ...SIMPLE, fcfMargin: [-0.02], netDebt: -1000, revenueGrowth: [0.12] };
  const r = impliedGrowth(inputs, priceOf(inputs));
  expect(r.ok).toBe(true);
  if (r.ok) expect(Math.abs(r.growth - 0.12)).toBeLessThan(1e-6);
});

test("invalid targets and inputs are rejected before solving", () => {
  for (const t of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = impliedGrowth(SIMPLE, t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid target");
  }
  const bad = impliedGrowth({ ...SIMPLE, sharesDiluted: 0 }, 100);
  expect(bad.ok).toBe(false);
  if (!bad.ok) {
    expect(bad.reason).toBe("invalid inputs");
    expect(bad.errors?.join(" ")).toContain("sharesDiluted");
  }
});

test("solver flags ambiguity instead of picking one of several roots", () => {
  // x^2 = 0.25 on [-1, 1] has roots -0.5 and 0.5.
  const r = solveMonotonic((x) => x * x, 0.25, -1, 1);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toBe("multiple solutions in range");
    expect(r.roots).toHaveLength(2);
    expect(r.roots?.[0]).toBeCloseTo(-0.5, 9);
    expect(r.roots?.[1]).toBeCloseTo(0.5, 9);
  }
  // A single root on a non-monotonic curve is returned with monotonic: false.
  const one = solveMonotonic((x) => x * x - x, 0.5, 0, 2);
  expect(one.ok).toBe(true);
  if (one.ok) {
    expect(one.value).toBeCloseTo((1 + Math.sqrt(3)) / 2, 9);
    expect(one.monotonic).toBe(false);
  }
  expect(solveMonotonic(() => null, 1, 0, 1).ok).toBe(false);
});
