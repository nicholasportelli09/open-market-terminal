import { expect, test } from "@playwright/test";
import {
  buildLedger,
  moneyWeightedReturn,
  simpleTotalReturn,
  validatePortfolio,
  validateTransaction,
  valuePortfolio,
  xirr,
  type Portfolio,
  type PriceInput,
  type Transaction,
} from "@/lib/portfolio";

let seq = 0;
function tx(fields: Omit<Transaction, "id" | "createdAt" | "updatedAt">): Transaction {
  seq += 1;
  const ts = new Date(Date.UTC(2020, 0, 1, 0, 0, seq)).toISOString();
  return { id: `t${seq}`, createdAt: ts, updatedAt: ts, ...fields };
}
function portfolio(transactions: Transaction[], baseCurrency = "USD"): Portfolio {
  const ts = "2020-01-01T00:00:00.000Z";
  return { version: 1, id: "p1", name: "Test", baseCurrency, transactions, createdAt: ts, updatedAt: ts };
}
function price(value: number, currency = "USD", previousClose?: number): PriceInput {
  return { price: value, currency, asOf: "2025-06-30T20:00:00Z", session: "closed", source: "cnbc", previousClose };
}
const AS_OF = "2025-06-30";

test("two buys and a partial sell: FIFO realized P&L, open lots and implicit funding", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "buy", symbol: "AAPL", quantity: 10, price: 100, fees: 10, currency: "USD" }),
    tx({ date: "2025-02-03", type: "buy", symbol: "AAPL", quantity: 10, price: 120, currency: "USD" }),
    tx({ date: "2025-03-03", type: "sell", symbol: "AAPL", quantity: 15, price: 130, fees: 5, currency: "USD" }),
  ]);
  const ledger = buildLedger(p);
  // Proceeds 15 * 130 - 5 = 1945. FIFO cost: 10 * 101 (fees in cost) + 5 * 120 = 1610.
  expect(ledger.realized[0].realizedLocal).toBeCloseTo(335, 9);
  expect(ledger.positions[0].quantity).toBe(5);
  expect(ledger.positions[0].costLocal).toBeCloseTo(600, 9);
  expect(ledger.implicitDeposits.map((f) => f.amount)).toEqual([1010, 1200]);

  const v = valuePortfolio(p, { AAPL: price(140, "USD", 138) }, {}, { asOf: AS_OF });
  const pos = v.positions[0];
  expect(pos.avgCost).toBeCloseTo(120, 9);
  expect(pos.marketValueBase).toBeCloseTo(700, 9);
  expect(pos.unrealizedBase).toBeCloseTo(100, 9);
  expect(pos.dayChange?.changeLocal).toBeCloseTo(10, 9);
  expect(v.totals.realizedBase).toBeCloseTo(335, 9);
  expect(v.totals.cashBase).toBeCloseTo(1945, 9);
  expect(v.totals.depositsBase).toBeCloseTo(2210, 9);
  expect(v.totals.totalReturnBase).toBeCloseTo(435, 9); // 335 realized + 100 unrealized
  expect(v.totals.totalReturnPct).toBeCloseTo(435 / 2210, 9);
  expect(v.totals.complete).toBe(true);
});

test("multi-currency: price effect + FX effect = unrealized in base", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "deposit", amount: 10000, currency: "EUR", fxToBase: 1.1 }),
    tx({ date: "2025-01-03", type: "buy", symbol: "SAP", quantity: 10, price: 200, currency: "EUR", fxToBase: 1.1 }),
  ]);
  const fx = { EUR: { rateToBase: 1.2, asOf: "2025-06-30T20:00:00Z", source: "cnbc" as const } };
  const v = valuePortfolio(p, { SAP: price(250, "EUR") }, fx, { asOf: AS_OF });
  const pos = v.positions[0];
  expect(pos.costBasisBase).toBeCloseTo(2200, 9);
  expect(pos.marketValueBase).toBeCloseTo(3000, 9);
  expect(pos.unrealizedLocal).toBeCloseTo(500, 9);
  expect(pos.priceEffectBase).toBeCloseTo(550, 9); // 10 * 50 * 1.10
  expect(pos.fxEffectBase).toBeCloseTo(250, 9); // 10 * 250 * (1.20 - 1.10)
  expect(pos.priceEffectBase + pos.fxEffectBase).toBeCloseTo(pos.unrealizedBase, 9);
  expect(pos.costAtCurrentFx).toBe(false);
  expect(v.cash).toEqual([{ currency: "EUR", amount: 8000, amountBase: 9600, fx: fx.EUR }]);
  expect(v.totals.totalValueBase).toBeCloseTo(12600, 9);
  expect(v.totals.totalReturnBase).toBeCloseTo(1600, 9); // 800 position + 800 FX gain on EUR cash
  expect(v.exposure.currencyExposure).toEqual([{ currency: "EUR", valueBase: 12600, pct: 1 }]);
  expect(v.warnings).toEqual([]);
});

test("cost without a trade-date FX rate uses current FX and says so", () => {
  const p = portfolio([tx({ date: "2025-01-03", type: "buy", symbol: "SAP", quantity: 10, price: 200, currency: "EUR" })]);
  const fx = { EUR: { rateToBase: 1.2, asOf: "2025-06-30T20:00:00Z", source: "cnbc" as const } };
  const v = valuePortfolio(p, { SAP: price(250, "EUR") }, fx, { asOf: AS_OF });
  expect(v.positions[0].costBasisBase).toBeCloseTo(2400, 9);
  expect(v.positions[0].fxEffectBase).toBeCloseTo(0, 9);
  expect(v.warnings).toContain("cost of SAP converted at current FX");
});

test("implicit funding covers only the shortfall of a buy", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "deposit", amount: 500, currency: "USD" }),
    tx({ date: "2025-01-05", type: "buy", symbol: "MSFT", quantity: 10, price: 100, currency: "USD" }),
  ]);
  const ledger = buildLedger(p);
  expect(ledger.implicitDeposits).toHaveLength(1);
  expect(ledger.implicitDeposits[0]).toMatchObject({ date: "2025-01-05", amount: 500, kind: "implicit_deposit" });
  expect(ledger.cash.USD).toBeCloseTo(0, 9);
  const v = valuePortfolio(p, { MSFT: price(110) }, {}, { asOf: AS_OF });
  expect(v.totals.netContributionsBase).toBeCloseTo(1000, 9);
  expect(v.totals.totalReturnBase).toBeCloseTo(100, 9);
});

test("dividends, interest and fees feed income and cash", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "buy", symbol: "KO", quantity: 10, price: 50, currency: "USD" }),
    tx({ date: "2025-03-01", type: "dividend", symbol: "KO", amount: 20, currency: "USD" }),
    tx({ date: "2025-03-02", type: "interest", amount: 3, currency: "USD" }),
    tx({ date: "2025-03-03", type: "fee", amount: 5, currency: "USD" }),
  ]);
  const v = valuePortfolio(p, { KO: price(50) }, {}, { asOf: AS_OF });
  expect(v.totals.incomeBase).toBeCloseTo(18, 9);
  expect(v.totals.cashBase).toBeCloseTo(18, 9);
  expect(v.totals.totalValueBase).toBeCloseTo(518, 9);
  expect(v.totals.totalReturnBase).toBeCloseTo(18, 9);
  const simple = simpleTotalReturn(v);
  expect(simple.ok && simple.returnPct).toBeCloseTo(18 / 500, 9);
  expect(v.allocation.byAssetType.map((s) => s.key)).toEqual(["stock", "cash"]);
});

test("fx conversion moves cash between currencies", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "deposit", amount: 1000, currency: "USD" }),
    tx({ date: "2025-01-03", type: "fx", amount: 1000, currency: "USD", toCurrency: "EUR", toAmount: 900 }),
  ]);
  const ledger = buildLedger(p);
  expect(ledger.cash.USD).toBeCloseTo(0, 9);
  expect(ledger.cash.EUR).toBe(900);
  expect(ledger.implicitDeposits).toHaveLength(0);
});

test("xirr matches the Excel documentation example", () => {
  const r = xirr([
    { date: "2008-01-01", amount: -10000 },
    { date: "2008-03-01", amount: 2750 },
    { date: "2008-10-30", amount: 4250 },
    { date: "2009-02-15", amount: 3250 },
    { date: "2009-04-01", amount: 2750 },
  ]);
  expect(r).not.toBeNull();
  expect(r as number).toBeCloseTo(0.373362535, 8);
});

test("xirr returns null without a sign change", () => {
  expect(xirr([{ date: "2025-01-01", amount: -100 }, { date: "2025-06-01", amount: -50 }])).toBeNull();
  expect(xirr([])).toBeNull();
});

test("money-weighted return: annualized headline only for a year or more", () => {
  const long = portfolio([tx({ date: "2024-01-01", type: "buy", symbol: "X", quantity: 10, price: 100, currency: "USD" })]);
  const mwr = moneyWeightedReturn(valuePortfolio(long, { X: price(110) }, {}, { asOf: "2025-01-01" }));
  expect(mwr.ok).toBe(true);
  if (!mwr.ok) return;
  expect(mwr.periodDays).toBe(366);
  expect(mwr.annualized).toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 8);
  expect(mwr.cumulative).toBeCloseTo(0.1, 8);
  expect(mwr.headline).toBe("annualized");

  const short = portfolio([tx({ date: "2025-01-01", type: "buy", symbol: "X", quantity: 10, price: 100, currency: "USD" })]);
  const s = moneyWeightedReturn(valuePortfolio(short, { X: price(105) }, {}, { asOf: "2025-04-01" }));
  expect(s.ok && s.headline).toBe("cumulative");
  expect(s.ok && s.headlineValue).toBeCloseTo(0.05, 8);
});

test("selling more than held is a validation error naming the transaction", () => {
  const sell = tx({ date: "2025-02-01", type: "sell", symbol: "NVDA", quantity: 6, price: 10, currency: "USD" });
  const p = portfolio([tx({ date: "2025-01-01", type: "buy", symbol: "NVDA", quantity: 5, price: 10, currency: "USD" }), sell]);
  const issues = validatePortfolio(p, { today: AS_OF });
  expect(issues).toHaveLength(1);
  expect(issues[0].transactionId).toBe(sell.id);
  expect(issues[0].message).toContain(sell.id);
  expect(buildLedger(p).issues[0].transactionId).toBe(sell.id);
});

test("transaction field validation", () => {
  const base = { id: "a", createdAt: "x", updatedAt: "x", currency: "USD" };
  expect(validateTransaction({ ...base, type: "buy", date: "2025-02-30", symbol: "AAPL", quantity: 1, price: 1 }, { today: AS_OF })
    .map((e) => e.field)).toEqual(["date"]);
  expect(validateTransaction({ ...base, type: "buy", date: "2025-07-01", symbol: "AAPL", quantity: 1, price: 1 }, { today: AS_OF })[0].message)
    .toContain("future");
  const bad = validateTransaction({ ...base, currency: "usd", type: "buy", date: "2025-01-01", symbol: "AA PL", quantity: -1 }, { today: AS_OF });
  expect(bad.map((e) => e.field).sort()).toEqual(["currency", "price", "quantity", "symbol"]);
  expect(validateTransaction({ ...base, type: "deposit", date: "2025-01-01", amount: 10 }, { today: AS_OF })).toEqual([]);
  expect(validateTransaction({ ...base, type: "fx", date: "2025-01-01", amount: 10, toCurrency: "USD", toAmount: 9 }, { today: AS_OF })
    .map((e) => e.field)).toEqual(["toCurrency"]);
});

test("missing prices are excluded from totals and reported, never valued at cost", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "buy", symbol: "AAPL", quantity: 1, price: 100, currency: "USD" }),
    tx({ date: "2025-01-02", type: "buy", symbol: "MSFT", quantity: 1, price: 300, currency: "USD" }),
  ]);
  const v = valuePortfolio(p, { AAPL: price(150) }, {}, { asOf: AS_OF });
  expect(v.positions.map((x) => x.symbol)).toEqual(["AAPL"]);
  expect(v.missing.prices).toEqual(["MSFT"]);
  expect(v.totals.marketValueBase).toBeCloseTo(150, 9);
  expect(v.totals.costBasisBase).toBeCloseTo(100, 9);
  expect(v.totals.complete).toBe(false);
  expect(v.totals.totalReturnBase).toBeNull();
  expect(moneyWeightedReturn(v)).toMatchObject({ ok: false, reason: "incomplete" });
  expect(v.warnings.some((w) => w.includes("MSFT"))).toBe(true);
});

test("missing FX rate is reported and excludes the position", () => {
  const p = portfolio([tx({ date: "2025-01-02", type: "buy", symbol: "7203.T", quantity: 100, price: 2500, currency: "JPY" })]);
  const v = valuePortfolio(p, { "7203.T": price(2600, "JPY") }, {}, { asOf: AS_OF });
  expect(v.positions).toHaveLength(0);
  expect(v.missing.fx).toEqual(["JPY"]);
  expect(v.totals.complete).toBe(false);
});
