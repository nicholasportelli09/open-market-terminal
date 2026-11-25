import { expect, test } from "@playwright/test";
import {
  cagr,
  capmCostOfEquity,
  computeMultiple,
  enterpriseValue,
  impliedPrice,
  marginOfSafety,
  marketCap,
  peerStats,
  upside,
  wacc,
  type CompanyMetrics,
  type MultipleName,
} from "@/lib/valuation";

/**
 * Hand case: price 50, 100 shares -> market cap 5000; net debt 1000 -> EV 6000.
 *   P/E = 50 / 2.5 = 20      EV/EBITDA = 6000 / 600 = 10   EV/EBIT = 6000 / 400 = 15
 *   EV/Sales = 6000 / 3000 = 2   P/FCF = 5000 / 250 = 20   P/B = 5000 / 2000 = 2.5
 */
const CO: CompanyMetrics = {
  symbol: "AAA",
  price: 50,
  shares: 100,
  netDebt: 1000,
  eps: 2.5,
  ebitda: 600,
  ebit: 400,
  revenue: 3000,
  fcf: 250,
  bookValue: 2000,
};

const ALL: MultipleName[] = ["pe", "evEbitda", "evEbit", "evSales", "pFcf", "pb"];

test("multiples match the hand computation", () => {
  expect(marketCap(CO)).toBe(5000);
  expect(enterpriseValue(CO)).toBe(6000);
  const expected = { pe: 20, evEbitda: 10, evEbit: 15, evSales: 2, pFcf: 20, pb: 2.5 };
  for (const name of ALL) expect(computeMultiple(CO, name)).toEqual({ ok: true, value: expected[name] });
});

test("multiples are not meaningful for zero / negative metrics, missing data or negative EV", () => {
  expect(computeMultiple({ ...CO, eps: -1 }, "pe").ok).toBe(false);
  expect(computeMultiple({ ...CO, ebitda: 0 }, "evEbitda").ok).toBe(false);
  expect(computeMultiple({ ...CO, fcf: undefined }, "pFcf").ok).toBe(false);
  expect(computeMultiple({ ...CO, netDebt: -6000 }, "evSales").ok).toBe(false);
  expect(computeMultiple({ ...CO, price: Number.NaN }, "pb").ok).toBe(false);
});

test("implied price: EV multiples subtract net debt, equity multiples do not", () => {
  // EV/EBITDA 12: EV = 7200, equity = 7200 - 1000 = 6200, price = 62.
  expect(impliedPrice(CO, "evEbitda", 12)).toEqual({ ok: true, price: 62, equityValue: 6200, enterpriseValue: 7200, warnings: [] });
  // Net cash 500: EV/EBITDA 8 -> EV 4800, equity 4800 + 500 = 5300, price 53.
  const cash = impliedPrice({ ...CO, netDebt: -500 }, "evEbitda", 8);
  expect(cash.ok && cash.price).toBe(53);
  // P/E 24 on eps 2.5 -> 60.  P/B 3 on book 2000 -> equity 6000 -> 60.  P/FCF 18 on 250 -> 4500 -> 45.
  expect(impliedPrice(CO, "pe", 24).ok && (impliedPrice(CO, "pe", 24) as { price: number }).price).toBe(60);
  const pb = impliedPrice(CO, "pb", 3);
  expect(pb.ok && pb.price).toBe(60);
  const pf = impliedPrice(CO, "pFcf", 18);
  expect(pf.ok && pf.price).toBe(45);
});

test("implied price round-trips each company's own multiple back to its price", () => {
  for (const name of ALL) {
    const m = computeMultiple(CO, name);
    if (!m.ok) throw new Error(name);
    const p = impliedPrice(CO, name, m.value);
    expect(p.ok, name).toBe(true);
    if (p.ok) expect(p.price).toBeCloseTo(CO.price, 9);
  }
  const levered = { ...CO, netDebt: 4321.5, price: 17.25 };
  const m = computeMultiple(levered, "evEbit");
  const p = m.ok ? impliedPrice(levered, "evEbit", m.value) : null;
  expect(p?.ok && p.price).toBeCloseTo(17.25, 9);
});

test("other claims (minority, preferred) sit in EV and come out of implied equity, as in the DCF", () => {
  const withMinority = { ...CO, otherAdjustments: 600 };
  // EV = 5000 + 1000 + 600 = 6600; EV/EBITDA = 11; implied at 11: equity = 6600 - 1000 - 600 = 5000 -> 50.
  expect(enterpriseValue(withMinority)).toBe(6600);
  expect(computeMultiple(withMinority, "evEbitda")).toEqual({ ok: true, value: 11 });
  const p = impliedPrice(withMinority, "evEbitda", 11);
  expect(p.ok && p.price).toBeCloseTo(50, 9);
  expect(enterpriseValue({ ...CO, otherAdjustments: Number.NaN })).toBeNull();
  expect(impliedPrice({ ...CO, otherAdjustments: Number.NaN }, "evEbitda", 10).ok).toBe(false);
});

test("implied price is null-with-reason when the target metric is <= 0 or the multiple is invalid", () => {
  const neg = impliedPrice({ ...CO, ebitda: -50 }, "evEbitda", 10);
  expect(neg.ok).toBe(false);
  if (!neg.ok) expect(neg.reason).toContain("zero or negative");
  expect(impliedPrice({ ...CO, eps: 0 }, "pe", 15).ok).toBe(false);
  expect(impliedPrice(CO, "pe", 0).ok).toBe(false);
  expect(impliedPrice(CO, "pe", Number.NaN).ok).toBe(false);
  expect(impliedPrice({ ...CO, shares: 0 }, "pb", 2).ok).toBe(false);
  // Net debt above implied EV: computed, not hidden, with a warning.
  const deep = impliedPrice({ ...CO, netDebt: 10000 }, "evSales", 2);
  expect(deep.ok && deep.price).toBe(-40);
  expect(deep.ok && deep.warnings.length).toBe(1);
});

test("peer stats use finite positive multiples only and count exclusions", () => {
  // EV/EBITDA for peers: (cap + netDebt) / ebitda
  const peers: CompanyMetrics[] = [
    { symbol: "P1", price: 10, shares: 100, netDebt: 0, ebitda: 125 }, // 8
    { symbol: "P2", price: 10, shares: 100, netDebt: 0, ebitda: 100 }, // 10
    { symbol: "P3", price: 10, shares: 100, netDebt: 200, ebitda: 100 }, // 12
    { symbol: "P4", price: 30, shares: 100, netDebt: 0, ebitda: 100 }, // 30
    { symbol: "NEG", price: 10, shares: 100, netDebt: 0, ebitda: -40 }, // excluded
    { symbol: "MISS", price: 10, shares: 100, netDebt: 0 }, // excluded
  ];
  const s = peerStats(peers, "evEbitda");
  // sorted 8, 10, 12, 30 -> median 11, mean 15, min 8, max 30
  expect(s).toEqual({ ok: true, median: 11, mean: 15, min: 8, max: 30, n: 4, excluded: 2, excludedSymbols: ["NEG", "MISS"] });
  const odd = peerStats(peers.slice(0, 3), "evEbitda");
  expect(odd.ok && odd.median).toBe(10);
  const none = peerStats([peers[4]], "evEbitda");
  expect(none).toMatchObject({ ok: false, n: 0, excluded: 1 });
  expect(peerStats([], "pe").ok).toBe(false);
});

test("upside and margin of safety", () => {
  expect(upside(125, 100)).toBeCloseTo(0.25, 12);
  expect(upside(80, 100)).toBeCloseTo(-0.2, 12);
  expect(upside(100, 0)).toBeNull();
  expect(marginOfSafety(125, 100)).toBeCloseTo(0.2, 12); // 1 - 100/125
  expect(marginOfSafety(100, 125)).toBeCloseTo(-0.25, 12); // price above fair -> negative
  expect(marginOfSafety(0, 100)).toBeNull();
  expect(marginOfSafety(-10, 100)).toBeNull();
  expect(upside(Number.NaN, 100)).toBeNull();
});

test("CAPM, WACC and CAGR", () => {
  // 4 % + 1.2 * 5 % = 10 %
  expect(capmCostOfEquity(0.04, 1.2, 0.05)).toBeCloseTo(0.1, 12);
  expect(capmCostOfEquity(0.04, Number.NaN, 0.05)).toBeNull();
  // E 800, D 200: 0.8 * 10 % + 0.2 * 5 % * (1 - 25 %) = 8 % + 0.75 % = 8.75 %
  expect(wacc({ equityValue: 800, debtValue: 200, costOfEquity: 0.1, preTaxCostOfDebt: 0.05, taxRate: 0.25 })).toBeCloseTo(0.0875, 12);
  expect(wacc({ equityValue: 1000, debtValue: 0, costOfEquity: 0.1, preTaxCostOfDebt: 0.05, taxRate: 0.25 })).toBeCloseTo(0.1, 12);
  expect(wacc({ equityValue: 0, debtValue: 0, costOfEquity: 0.1, preTaxCostOfDebt: 0.05, taxRate: 0.25 })).toBeNull();
  expect(wacc({ equityValue: 800, debtValue: -1, costOfEquity: 0.1, preTaxCostOfDebt: 0.05, taxRate: 0.25 })).toBeNull();
  expect(wacc({ equityValue: 800, debtValue: 200, costOfEquity: 0.1, preTaxCostOfDebt: 0.05, taxRate: 1.2 })).toBeNull();
  // 100 -> 200 over 5 years: 2^(1/5) - 1 = 0.148698354997...
  expect(cagr(100, 200, 5)).toBeCloseTo(0.1486983549970351, 12);
  expect(cagr(100, 100, 3)).toBe(0);
  expect(cagr(100, 0, 3)).toBe(-1);
  expect(cagr(0, 100, 3)).toBeNull();
  expect(cagr(-50, 100, 3)).toBeNull();
  expect(cagr(100, 200, 0)).toBeNull();
});
