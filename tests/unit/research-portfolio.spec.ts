import { expect, test } from "@playwright/test";
import type { PortfolioValuation } from "@/lib/portfolio";
import { portfolioContent, portfolioHash, validatePortfolioSummary } from "@/lib/server/research/portfolio-summary";
import { MAX_PORTFOLIO_POSITIONS, type PortfolioSummary } from "@/lib/server/research/types";
import { parseBriefingRequest, parseResearchRequest } from "@/lib/server/research/validate";
import { buildPortfolioSummary } from "@/components/research/summary";

// Test inputs for validation and formatting only (not displayed market data).
const summary = (): PortfolioSummary => ({
  baseCurrency: "USD",
  asOf: "2026-11-20",
  totals: { totalValue: 10_000, marketValue: 9_000, cash: 1_000, unrealized: 500 },
  cashPct: 10,
  positions: [
    { symbol: "AAPL", currency: "USD", value: 6_000, weightPct: 60, unrealizedPct: 12.5 },
    { symbol: "ASML", currency: "EUR", value: 3_000, weightPct: 30, unrealizedPct: null },
  ],
  currencyExposure: [{ currency: "USD", pct: 70 }, { currency: "EUR", pct: 30 }],
  complete: true,
});

test("a well-formed summary validates unchanged", () => {
  const r = validatePortfolioSummary(summary());
  expect(r).toEqual({ ok: true, value: summary() });
});

test("unknown fields, wrong types and bad symbols are rejected", () => {
  expect(validatePortfolioSummary({ ...summary(), notes: "hi" })).toMatchObject({ ok: false, error: expect.stringContaining("unexpected field") });
  const extraInPosition = summary();
  extraInPosition.positions = [{ ...extraInPosition.positions[0], costBasis: 1 } as never];
  expect(validatePortfolioSummary(extraInPosition).ok).toBe(false);
  expect(validatePortfolioSummary({ ...summary(), cashPct: "10" }).ok).toBe(false);
  expect(validatePortfolioSummary({ ...summary(), totals: { ...summary().totals, cash: Number.NaN } }).ok).toBe(false);
  const badSymbol = summary();
  badSymbol.positions = [{ ...badSymbol.positions[0], symbol: "<script>" }];
  expect(validatePortfolioSummary(badSymbol).ok).toBe(false);
  expect(validatePortfolioSummary({ ...summary(), asOf: "2026-13-45" }).ok).toBe(false);
  expect(validatePortfolioSummary([]).ok).toBe(false);
});

test("too many positions or an oversized payload is rejected", () => {
  const many = summary();
  many.positions = Array.from({ length: MAX_PORTFOLIO_POSITIONS + 1 }, (_, i) => ({ symbol: `S${i}`, currency: "USD", value: 1, weightPct: 1, unrealizedPct: 1 }));
  expect(validatePortfolioSummary(many)).toMatchObject({ ok: false, error: expect.stringContaining(`${MAX_PORTFOLIO_POSITIONS}`) });
  const huge = { ...summary(), baseCurrency: "X".repeat(20_000) };
  expect(validatePortfolioSummary(huge)).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
});

test("portfolio hash is stable, order-sensitive to content, and 'none' without a portfolio", () => {
  expect(portfolioHash(undefined)).toBe("none");
  expect(portfolioHash(summary())).toBe(portfolioHash(summary()));
  expect(portfolioHash(summary())).toMatch(/^[0-9a-f]{8}$/);
  expect(portfolioHash({ ...summary(), cashPct: 11 })).not.toBe(portfolioHash(summary()));
});

test("portfolio content lists positions by weight with the sent figures only", () => {
  const text = portfolioContent(summary());
  expect(text).toContain("Total value 10000.00 USD");
  expect(text.indexOf("AAPL")).toBeLessThan(text.indexOf("ASML"));
  expect(text).toContain("ASML | EUR | 3000.00 | 30.00% | n/a");
  expect(text).toContain("Currency exposure: USD 70.00%, EUR 30.00%.");
});

test("the browser-built summary passes the server validator", () => {
  const valuation = {
    baseCurrency: "usd",
    asOf: "2026-11-20",
    positions: [
      { symbol: "msft", currency: "USD", quantity: 2, marketValueBase: 800.456, weight: 0.4, unrealizedPct: 0.1234 },
      { symbol: "SAP", currency: "EUR", quantity: 0, marketValueBase: 0, weight: 0, unrealizedPct: null },
      { symbol: "ASML", currency: "EUR", quantity: 1, marketValueBase: 1000, weight: 0.5, unrealizedPct: null },
    ],
    exposure: { cashPct: 0.1, grossInvestedPct: 0.9, currencyExposure: [{ currency: "USD", valueBase: 1000, pct: 0.5 }, { currency: "EUR", valueBase: 1000, pct: 0.5 }] },
    totals: { totalValueBase: 2000, marketValueBase: 1800.456, cashBase: 199.544, unrealizedBase: 88, complete: false },
  } as unknown as PortfolioValuation;
  const s = buildPortfolioSummary(valuation);
  expect(s.positions.map((p) => p.symbol)).toEqual(["ASML", "MSFT"]);
  expect(s.positions[1]).toEqual({ symbol: "MSFT", currency: "USD", value: 800.46, weightPct: 40, unrealizedPct: 12.34 });
  expect(s.cashPct).toBe(10);
  expect(s.complete).toBe(false);
  expect(validatePortfolioSummary(s).ok).toBe(true);
});

test("research requests: per-mode tickers, thesis, window and portfolio requirements", () => {
  expect(parseResearchRequest({ mode: "analyze", symbols: ["aapl"], question: "" })).toEqual({ ok: true, value: { mode: "analyze", symbols: ["AAPL"], question: "" } });
  expect(parseResearchRequest({ mode: "analyze", symbols: [], question: "" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "compare", symbols: ["AAPL"], question: "" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "compare", symbols: ["AAPL", "MSFT", "NVDA", "AMZN", "META"], question: "" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "explain_move", symbols: ["NVDA"], question: "" })).toMatchObject({ ok: true, value: { window: "1d" } });
  expect(parseResearchRequest({ mode: "explain_move", symbols: ["NVDA"], window: "10y" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "analyze", symbols: ["AAPL"], window: "1d" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "challenge", symbols: [], thesis: "too short" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "challenge", symbols: ["AAPL"], thesis: "Services margins will keep rising for five years." }).ok).toBe(true);
  expect(parseResearchRequest({ mode: "portfolio", symbols: [] }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "portfolio", symbols: [], portfolio: summary() }).ok).toBe(true);
  expect(parseResearchRequest({ mode: "opportunities", symbols: [], question: "" }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "analyze", symbols: ["AAPL"], extra: 1 }).ok).toBe(false);
  expect(parseResearchRequest({ mode: "hack", symbols: [] }).ok).toBe(false);
});

test("briefing requests accept an empty body, refresh and a valid portfolio only", () => {
  expect(parseBriefingRequest(undefined)).toEqual({ ok: true, value: {} });
  expect(parseBriefingRequest({ refresh: true })).toEqual({ ok: true, value: { refresh: true } });
  expect(parseBriefingRequest({ refresh: "yes" }).ok).toBe(false);
  expect(parseBriefingRequest({ portfolio: { bad: true } }).ok).toBe(false);
  expect(parseBriefingRequest({ portfolio: summary() })).toMatchObject({ ok: true, value: { portfolio: summary() } });
});
