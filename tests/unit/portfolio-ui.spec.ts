import { expect, test } from "@playwright/test";
import { createPortfolio, createTransaction, addTransaction, moneyWeightedReturn, valuePortfolio, type Portfolio, type TransactionDraft } from "@/lib/portfolio";
import { addDaysIso, barsToCloses, chooseResolution, closeDate, crossToBase, pickCommonClose } from "@/app/api/fx-history/select";
import { checkDraft, emptyForm, formFromTransaction, formToDraft, parseNumber } from "@/components/portfolio/form-model";
import { sortRows } from "@/components/portfolio/money";
import { daySummary, mwrView } from "@/components/portfolio/summary-model";
import { assetTypeFromSearch, cashEffect, describeTransaction, newestFirst, transactionNotes, valuationSources } from "@/components/portfolio/view-model";

const NOW = new Date("2026-11-20T12:00:00Z");
const TODAY = "2026-11-20";

function withTx(p: Portfolio, drafts: TransactionDraft[]): Portfolio {
  return drafts.reduce((acc, d, i) => addTransaction(acc, createTransaction(d, new Date(NOW.getTime() + i * 1000)), NOW), p);
}

test("parseNumber accepts plain and thousands-separated numbers and rejects decimal commas", () => {
  expect(parseNumber("1234.5")).toEqual({ ok: true, value: 1234.5 });
  expect(parseNumber("1,234.5")).toEqual({ ok: true, value: 1234.5 });
  expect(parseNumber("")).toEqual({ ok: true, value: undefined });
  expect(parseNumber("1,5").ok).toBe(false);
  expect(parseNumber("-3").ok).toBe(false);
  expect(parseNumber("abc").ok).toBe(false);
});

test("formToDraft maps a buy, drops fxToBase in the base currency and clears unused fields", () => {
  const values = { ...emptyForm("buy", "CHF", TODAY), symbol: " aapl ", quantity: "10", price: "150", currency: "usd", fxToBase: "0.9", amount: "999" };
  const { draft, errors } = formToDraft(values, "CHF");
  expect(errors).toEqual({});
  expect(draft).toMatchObject({ type: "buy", symbol: "AAPL", quantity: 10, price: 150, currency: "USD", fxToBase: 0.9, amount: undefined });

  const inBase = formToDraft({ ...values, currency: "CHF" }, "CHF");
  expect(inBase.draft?.fxToBase).toBeUndefined();

  const deposit = formToDraft({ ...emptyForm("deposit", "CHF", TODAY), amount: "2,000" }, "CHF");
  expect(deposit.draft).toMatchObject({ type: "deposit", currency: "CHF", amount: 2000, symbol: undefined, quantity: undefined });

  const bad = formToDraft({ ...values, quantity: "ten" }, "CHF");
  expect(bad.draft).toBeNull();
  expect(bad.errors.quantity).toBeTruthy();
});

test("formFromTransaction round-trips through formToDraft", () => {
  const tx = createTransaction({ type: "sell", date: "2026-03-02", symbol: "AAPL", quantity: 4, price: 200, fees: 1, currency: "USD", fxToBase: 0.88 }, NOW);
  const { draft } = formToDraft(formFromTransaction(tx), "CHF");
  expect(draft).toMatchObject({ type: "sell", symbol: "AAPL", quantity: 4, price: 200, fees: 1, currency: "USD", fxToBase: 0.88 });
});

test("checkDraft reports field errors and selling more than held", () => {
  const p = withTx(createPortfolio("T", "CHF", NOW), [{ type: "buy", date: "2026-01-05", symbol: "AAPL", quantity: 10, price: 150, currency: "USD" }]);
  const missingPrice = checkDraft(p, { type: "buy", date: "2026-02-01", symbol: "AAPL", quantity: 1, currency: "USD" }, null, TODAY);
  expect(missingPrice.price).toMatch(/required/i);
  const future = checkDraft(p, { type: "deposit", date: "2026-12-01", amount: 5, currency: "CHF" }, null, TODAY);
  expect(future.date).toMatch(/future/i);
  const oversell = checkDraft(p, { type: "sell", date: "2026-02-01", symbol: "AAPL", quantity: 11, price: 160, currency: "USD" }, null, TODAY);
  expect(oversell.quantity).toMatch(/exceeds/);
  const ok = checkDraft(p, { type: "sell", date: "2026-02-01", symbol: "AAPL", quantity: 4, price: 160, currency: "USD" }, null, TODAY);
  expect(Object.values(ok).filter(Boolean)).toEqual([]);

  // Editing the buy down to 2 units would break a later sell of 4: reported at form level.
  const withSell = withTx(p, [{ type: "sell", date: "2026-02-01", symbol: "AAPL", quantity: 4, price: 160, currency: "USD" }]);
  const buyId = withSell.transactions[0].id;
  const edit = checkDraft(withSell, { type: "buy", date: "2026-01-05", symbol: "AAPL", quantity: 2, price: 150, currency: "USD" }, buyId, TODAY);
  expect(edit.form).toMatch(/break other transactions/);
});

test("fx-history: daily pick uses the last common close on or before the date", () => {
  const eur = [
    { date: "2026-03-12", close: 1.09 },
    { date: "2026-03-13", close: 1.1 },
    { date: "2026-03-16", close: 1.11 },
  ];
  const chf = [
    { date: "2026-03-12", close: 0.8 },
    { date: "2026-03-13", close: 0.79 },
  ];
  expect(pickCommonClose(eur, chf, "2026-03-15", "daily")).toEqual({ barDate: "2026-03-13", date: "2026-03-13", currencyClose: 1.1, baseClose: 0.79 });
  // A USD leg (null) has every date.
  expect(pickCommonClose(null, chf, "2026-03-12", "daily")).toEqual({ barDate: "2026-03-12", date: "2026-03-12", currencyClose: null, baseClose: 0.8 });
  expect(pickCommonClose(eur, chf, "2026-03-01", "daily")).toBeNull();
});

test("fx-history: weekly bars count only once their Friday close is on or before the date", () => {
  const weekly = [
    { date: "2023-01-22", close: 1.08 },
    { date: "2023-01-29", close: 1.09 },
  ];
  expect(closeDate("2023-01-22", "weekly")).toBe("2023-01-27");
  expect(pickCommonClose(weekly, null, "2023-02-01", "weekly")?.date).toBe("2023-01-27");
  expect(pickCommonClose(weekly, null, "2023-02-03", "weekly")?.date).toBe("2023-02-03");
  expect(chooseResolution([[{ date: "2025-11-24", close: 1 }], null], "2025-06-01")).toBe("weekly");
  expect(chooseResolution([[{ date: "2025-11-24", close: 1 }], null], "2026-01-01")).toBe("daily");
});

test("fx-history: crossing and bar dates", () => {
  // 1 EUR = 1.1 USD, 1 USD = 0.8 CHF (USD per CHF = 1.25) -> 0.88 CHF per EUR.
  expect(crossToBase(1.1, 1.25)).toBeCloseTo(0.88, 12);
  expect(crossToBase(0, 1)).toBeNull();
  expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
  const t = Date.UTC(2026, 2, 13, 17, 0) / 1000;
  expect(barsToCloses([{ t, o: 1, h: 1, l: 1, c: 1.1, v: 0 }, { t: t + 86400, o: 1, h: 1, l: 1, c: 0, v: 0 }], "daily")).toEqual([{ date: "2026-03-13", close: 1.1 }]);
});

test("fx-history: weekend daily bars are dropped so a Sunday date reports Friday's close", () => {
  const fri = Date.UTC(2026, 2, 13, 17, 0) / 1000;
  const sun = Date.UTC(2026, 2, 15, 17, 0) / 1000;
  const bars = [{ t: fri, o: 1, h: 1, l: 1, c: 0.7912, v: 0 }, { t: sun, o: 1, h: 1, l: 1, c: 0.7912, v: 0 }];
  const daily = barsToCloses(bars, "daily");
  expect(daily).toEqual([{ date: "2026-03-13", close: 0.7912 }]);
  expect(pickCommonClose(daily, null, "2026-03-15", "daily")?.date).toBe("2026-03-13");
  // Weekly bars are labelled with the Sunday that starts the week, so they stay.
  expect(barsToCloses([{ t: sun, o: 1, h: 1, l: 1, c: 0.79, v: 0 }], "weekly")).toEqual([{ date: "2026-03-15", close: 0.79 }]);
});

test("summary: money-weighted view follows the engine's headline flag and explains gaps", () => {
  const p = withTx(createPortfolio("T", "CHF", NOW), [{ type: "deposit", date: "2026-11-01", amount: 1000, currency: "CHF" }]);
  const v = valuePortfolio(p, {}, {}, { asOf: TODAY });
  const view = mwrView(moneyWeightedReturn(v), "");
  expect(view).toMatchObject({ ok: true, label: "Cumulative, not annualized" });
  expect(mwrView({ ok: false, reason: "period_too_short", message: "" }, "").label).toBe("Period too short");
  expect(mwrView({ ok: false, reason: "incomplete", message: "" }, "no price for AAPL").detail).toContain("AAPL");
});

test("summary: day change sums holdings with a previous close and lists the rest", () => {
  const p = withTx(createPortfolio("T", "USD", NOW), [
    { type: "buy", date: "2026-11-02", symbol: "AAPL", quantity: 10, price: 100, currency: "USD" },
    { type: "buy", date: "2026-11-02", symbol: "MSFT", quantity: 1, price: 400, currency: "USD" },
  ]);
  const prices = {
    AAPL: { price: 110, currency: "USD", asOf: "2026-11-20T21:00:00Z", source: "cnbc" as const, session: "closed" as const, previousClose: 100 },
    MSFT: { price: 410, currency: "USD", asOf: "2026-11-20T21:00:00Z", source: "cnbc" as const, session: "closed" as const },
  };
  const v = valuePortfolio(p, prices, {}, { asOf: TODAY });
  const day = daySummary(v);
  expect(day?.changeBase).toBeCloseTo(100, 9);
  expect(day?.pct).toBeCloseTo(0.1, 9);
  expect(day?.withoutPrevClose).toEqual(["MSFT"]);
  const sources = valuationSources(v, new Set(["AAPL"]));
  expect(sources[0]).toMatchObject({ source: "cnbc", session: "closed", delayed: true, note: "2 prices" });
  // Implicit funding (no deposit) shows up as a note under the buy, not as a row.
  const notes = transactionNotes(v);
  expect([...notes.values()].flat().some((n) => /implicit deposit/.test(n.text))).toBe(true);
});

test("view helpers: ordering, descriptions, cash effects, sorting", () => {
  const a = createTransaction({ type: "deposit", date: "2026-01-01", amount: 100, currency: "CHF" }, new Date("2026-01-01T10:00:00Z"));
  const b = createTransaction({ type: "fee", date: "2026-01-01", amount: 2, currency: "CHF" }, new Date("2026-01-01T11:00:00Z"));
  const c = createTransaction({ type: "buy", date: "2026-02-01", symbol: "AAPL", quantity: 2, price: 10, fees: 1, currency: "USD" }, NOW);
  expect(newestFirst([a, b, c]).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  expect(cashEffect(c)).toBe(-21);
  expect(cashEffect(b)).toBe(-2);
  expect(describeTransaction(c)).toBe("Buy 2 AAPL @ 10.00 USD + 1.00 USD fees");
  expect(assetTypeFromSearch("ETF")).toBe("etf");
  expect(assetTypeFromSearch("STOCK")).toBe("stock");
  expect(assetTypeFromSearch("INDEX")).toBe("other");
  const rows = [{ v: 2 }, { v: null }, { v: 5 }];
  expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([5, 2, null]);
  expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([2, 5, null]);
});
