import { expect, test } from "@playwright/test";
import {
  LocalPortfolioRepository,
  STORAGE_KEY,
  addTransaction,
  buildLedger,
  createPortfolio,
  createTransaction,
  moneyWeightedReturn,
  validatePortfolio,
  valuePortfolio,
  xirr,
  type Portfolio,
  type PriceInput,
  type StorageLike,
  type Transaction,
} from "@/lib/portfolio";

let seq = 0;
function tx(fields: Omit<Transaction, "id" | "createdAt" | "updatedAt">): Transaction {
  seq += 1;
  const ts = new Date(Date.UTC(2020, 0, 1, 0, 0, seq)).toISOString();
  return { id: `e${seq}`, createdAt: ts, updatedAt: ts, ...fields };
}
function portfolio(transactions: Transaction[], baseCurrency = "USD"): Portfolio {
  const ts = "2020-01-01T00:00:00.000Z";
  return { version: 1, id: "p1", name: "Test", baseCurrency, transactions, createdAt: ts, updatedAt: ts };
}
function price(value: number, currency = "USD"): PriceInput {
  return { price: value, currency, asOf: "2025-06-30T20:00:00Z", session: "closed", source: "cnbc" };
}
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const NOW = () => new Date("2025-06-30T12:00:00.000Z");
const USD_IN_EUR = { USD: { rateToBase: 0.9, asOf: "2025-06-30T20:00:00Z", source: "cnbc" as const } };

test("money-weighted return solves heavy losses over a few days", () => {
  const p = portfolio([tx({ date: "2025-01-02", type: "buy", symbol: "X", quantity: 10, price: 100, currency: "USD" })]);
  const cases = [
    { asOf: "2025-01-12", px: 70, expected: -0.3 },
    { asOf: "2025-01-07", px: 80, expected: -0.2 },
    { asOf: "2025-01-03", px: 50, expected: -0.5 },
  ];
  for (const c of cases) {
    const mwr = moneyWeightedReturn(valuePortfolio(p, { X: price(c.px) }, {}, { asOf: c.asOf }));
    expect(mwr.ok).toBe(true);
    if (!mwr.ok) continue;
    expect(mwr.headline).toBe("cumulative");
    expect(mwr.cumulative).toBeCloseTo(c.expected, 9);
    expect(mwr.annualized).toBeGreaterThanOrEqual(-1);
    expect(mwr.annualized).toBeLessThan(-0.99);
  }
});

test("money-weighted return refuses flows dated after the valuation date", () => {
  const p = portfolio([
    tx({ date: "2025-01-02", type: "buy", symbol: "X", quantity: 10, price: 100, currency: "USD" }),
    tx({ date: "2025-03-01", type: "deposit", amount: 500, currency: "USD" }),
  ]);
  const mwr = moneyWeightedReturn(valuePortfolio(p, { X: price(110) }, {}, { asOf: "2025-02-01" }));
  expect(mwr.ok === false && mwr.reason).toBe("flows_after_valuation");
});

test("xirr rejects impossible calendar dates", () => {
  expect(xirr([{ date: "2021-02-30", amount: -100 }, { date: "2022-03-01", amount: 110 }])).toBeNull();
});

test("a foreign buy is funded from base cash at its trade-date FX, not by a second deposit", () => {
  const p = portfolio(
    [
      tx({ date: "2025-01-02", type: "deposit", amount: 10000, currency: "EUR" }),
      tx({ date: "2025-01-03", type: "buy", symbol: "AAPL", quantity: 10, price: 500, currency: "USD", fxToBase: 0.9 }),
    ],
    "EUR",
  );
  const ledger = buildLedger(p);
  expect(ledger.implicitDeposits).toHaveLength(0);
  expect(ledger.implicitConversions).toEqual([
    { transactionId: p.transactions[1].id, date: "2025-01-03", fromCurrency: "EUR", fromAmount: 4500, toCurrency: "USD", toAmount: 5000, fxToBase: 0.9 },
  ]);
  expect(ledger.cash.EUR).toBeCloseTo(5500, 9);
  expect(ledger.cash.USD).toBeCloseTo(0, 9);
  const v = valuePortfolio(p, { AAPL: price(500) }, USD_IN_EUR, { asOf: "2025-06-30" });
  expect(v.totals.totalValueBase).toBeCloseTo(10000, 9);
  expect(v.totals.depositsBase).toBeCloseTo(10000, 9);
});

test("base cash covers part of a foreign buy; the rest is an implicit deposit", () => {
  const p = portfolio(
    [
      tx({ date: "2025-01-02", type: "deposit", amount: 900, currency: "EUR" }),
      tx({ date: "2025-01-03", type: "buy", symbol: "AAPL", quantity: 10, price: 500, currency: "USD", fxToBase: 0.9 }),
    ],
    "EUR",
  );
  const ledger = buildLedger(p);
  expect(ledger.cash.EUR).toBeCloseTo(0, 9);
  expect(ledger.implicitDeposits.map((f) => [f.currency, f.amount])).toEqual([["USD", 4000]]);
  const v = valuePortfolio(p, { AAPL: price(500) }, USD_IN_EUR, { asOf: "2025-06-30" });
  expect(v.totals.depositsBase).toBeCloseTo(4500, 9);
  expect(v.totals.totalValueBase).toBeCloseTo(4500, 9);
});

test("a foreign buy without a trade-date rate warns when base cash was available", () => {
  const p = portfolio(
    [
      tx({ date: "2025-01-02", type: "deposit", amount: 10000, currency: "EUR" }),
      tx({ date: "2025-01-03", type: "buy", symbol: "AAPL", quantity: 10, price: 500, currency: "USD" }),
    ],
    "EUR",
  );
  const ledger = buildLedger(p);
  expect(ledger.implicitDeposits).toHaveLength(1);
  expect(ledger.warnings).toHaveLength(1);
  const v = valuePortfolio(p, { AAPL: price(500) }, USD_IN_EUR, { asOf: "2025-06-30" });
  expect(v.warnings.some((w) => w.includes("EUR cash was available"))).toBe(true);
});

test("data from a newer schema is kept, reported and never overwritten", () => {
  const stored = JSON.stringify({ version: 2, id: "p", name: "Future", transactions: [] });
  const storage = memoryStorage({ [STORAGE_KEY]: stored });
  const repo = new LocalPortfolioRepository(storage, NOW);
  const status = repo.loadStatus();
  expect(status.status).toBe("newer_version");
  expect(status.status === "newer_version" && status.version).toBe(2);
  expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
  const saved = repo.save(createPortfolio("Main", "USD", NOW()));
  expect(saved.ok === false && saved.reason).toBe("newer_version");
  expect(storage.data.get(STORAGE_KEY)).toBe(stored);
});

test("symbols are case-insensitive: lower-case entries join the same position", () => {
  let p = createPortfolio("Main", "USD", NOW());
  p = addTransaction(p, createTransaction({ date: "2025-01-02", type: "buy", symbol: "aapl", quantity: 2, price: 150, currency: "USD" }, NOW()), NOW());
  p = addTransaction(p, createTransaction({ date: "2025-01-03", type: "sell", symbol: "AAPL", quantity: 2, price: 160, currency: "USD" }, NOW()), NOW());
  expect(validatePortfolio(p, { today: "2025-06-30" })).toEqual([]);
  expect(buildLedger(p).positions.map((pos) => [pos.symbol, pos.quantity])).toEqual([["AAPL", 0]]);
  const imported = new LocalPortfolioRepository(memoryStorage(), NOW).importJson(
    JSON.stringify({ ...p, transactions: p.transactions.map((t) => ({ ...t, symbol: "msft" })) }),
  );
  expect(imported.ok && imported.portfolio.transactions.map((t) => t.symbol)).toEqual(["MSFT", "MSFT"]);
});

test("save refusal names the transaction", () => {
  const repo = new LocalPortfolioRepository(memoryStorage(), NOW);
  const p = portfolio([tx({ date: "2025-01-02", type: "sell", symbol: "X", quantity: 1, price: 1, currency: "USD" })]);
  const saved = repo.save(p);
  expect(saved.ok === false && saved.message).toContain(`Transaction ${p.transactions[0].id}:`);
});
