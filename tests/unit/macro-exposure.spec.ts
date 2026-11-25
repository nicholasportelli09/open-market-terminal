import { expect, test } from "@playwright/test";
import { crossChange, summarizeExposure, type ExposureContext } from "@/lib/macro/exposure";
import { valuePortfolio, type Portfolio, type PriceInput, type Transaction } from "@/lib/portfolio";

let seq = 0;
function tx(fields: Omit<Transaction, "id" | "createdAt" | "updatedAt">): Transaction {
  seq += 1;
  const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
  return { id: `t${seq}`, createdAt: ts, updatedAt: ts, ...fields };
}
const portfolio = (transactions: Transaction[], baseCurrency = "USD"): Portfolio => ({
  version: 1,
  id: "p1",
  name: "Test",
  baseCurrency,
  transactions,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const price = (value: number, currency: string): PriceInput => ({ price: value, currency, asOf: "2026-11-20T21:00:00Z", session: "closed", source: "cnbc" });

const ctx: ExposureContext = {
  usdValue1y: { EUR: { value: 4, asOf: "2026-11-21" } },
  dollar1y: { value: -2.5, asOf: "2026-11-13" },
  policy: { USD: { label: "Fed funds effective", value: 3.88, asOf: "2026-11-19" } },
  vix: { value: 28.4, asOf: "2026-11-19" },
};

test("crossChange crosses two USD legs; USD itself is 0", () => {
  expect(crossChange("EUR", "USD", ctx.usdValue1y)?.value).toBeCloseTo(4, 10);
  // USD against EUR when EUR gained 4% in USD terms: USD lost 1 - 1/1.04.
  expect(crossChange("USD", "EUR", ctx.usdValue1y)?.value).toBeCloseTo((1 / 1.04 - 1) * 100, 10);
  expect(crossChange("GBP", "USD", ctx.usdValue1y)).toBeNull();
});

test("exposure summary: currency shares, cash vs invested, largest position, paired notes", () => {
  const p = portfolio([
    tx({ date: "2026-01-02", type: "deposit", amount: 10000, currency: "USD" }),
    tx({ date: "2026-01-03", type: "buy", symbol: "AAPL", quantity: 20, price: 200, currency: "USD" }),
    tx({ date: "2026-01-03", type: "buy", symbol: "SAP", quantity: 10, price: 200, currency: "EUR", fxToBase: 1.1 }),
  ]);
  const fx = { EUR: { rateToBase: 1.15, asOf: "2026-11-20T21:00:00Z", source: "cnbc" as const } };
  const v = valuePortfolio(p, { AAPL: price(250, "USD"), SAP: price(220, "EUR") }, fx, { asOf: "2026-11-20" });
  const s = summarizeExposure(v, ctx)!;
  expect(s.base).toBe("USD");
  expect(s.totalValueBase).toBeCloseTo(v.totals.totalValueBase, 9);
  const eur = s.currencies.find((c) => c.currency === "EUR")!;
  expect(eur.pct).toBeCloseTo((220 * 10 * 1.15) / v.totals.totalValueBase, 9);
  expect(eur.vsBase1y?.value).toBeCloseTo(4, 10);
  expect(s.largest?.symbol).toBe("AAPL");
  expect(s.cashPct).toBe(v.exposure.cashPct);
  expect(s.cashRate?.value).toBe(3.88);
  expect(s.notes.some((n) => n.includes("in EUR"))).toBe(true);
  expect(s.notes.some((n) => n.includes("broad dollar is down 2.5%"))).toBe(true);
  // AAPL is 5000 of ~ 10530: above the 25% concentration line, and the VIX note joins it.
  expect(s.notes.some((n) => n.startsWith("AAPL is") && n.includes("VIX at 28.4"))).toBe(true);
});

test("nothing valued yet gives no summary", () => {
  const v = valuePortfolio(portfolio([]), {}, {}, { asOf: "2026-11-20" });
  expect(summarizeExposure(v, ctx)).toBeNull();
});
