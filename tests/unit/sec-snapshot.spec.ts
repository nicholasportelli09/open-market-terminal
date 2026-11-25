import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSnapshot, type QuoteInput } from "@/lib/server/company-metrics";
import type { CompanyFactsRaw } from "@/lib/server/sec-facts";
import { normalizeFundamentals, type SecBase } from "@/lib/server/sec-fundamentals";

/**
 * Fixtures are real SEC companyfacts responses (captured 2026-11-21), trimmed to the concepts used.
 * Expected values are copied from the filings themselves (AAPL 10-K for FY2026, MSFT 10-Q Q1 FY2027).
 */
const facts = (name: string): CompanyFactsRaw =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures/sec", `${name}-companyfacts.json`), "utf8"));

function base(name: string): SecBase {
  const r = normalizeFundamentals(facts(name));
  if (r.kind !== "ok") throw new Error(r.reason);
  return r.base;
}

/** A Saturday, so the price session is "closed" whenever the test runs. */
const CLOSED_NOW = new Date("2026-11-21T15:00:00Z");

// Quote inputs here are test inputs for the arithmetic, not displayed data.
const quote = (symbol: string, last: number | null, currency = "USD", marketStatus = "POST_MKT"): QuoteInput => ({
  symbol, last, currency, marketStatus, time: "2026-11-20", timeText: "11/20/26 EST",
});

test("AAPL: TTM equals the FY2026 10-K when the latest period is a fiscal year", () => {
  const b = base("aapl");
  expect(b.currency).toBe("USD");
  expect(b.ttmEnd).toBe("2026-09-26");
  const v = b.values;
  expect(v.revenueTTM.value).toBe(478_834_000_000);
  expect(v.grossProfitTTM.value).toBe(233_602_000_000);
  expect(v.operatingIncomeTTM.value).toBe(158_063_000_000);
  expect(v.netIncomeTTM.value).toBe(132_175_000_000);
  expect(v.epsDilutedTTM.value).toBe(8.98);
  expect(v.operatingCashFlowTTM.value).toBe(145_097_000_000);
  expect(v.capexTTM.value).toBe(9_041_000_000);
  expect(v.depreciationAmortizationTTM.value).toBe(13_423_000_000);
  expect(v.revenuePriorTTM.value).toBe(416_161_000_000);
  // Cash 36,305 + marketable securities 20,417; debt = term debt 78,114 + commercial paper 1,997.
  expect(v.cash.value).toBe(56_722_000_000);
  expect(v.totalDebt.value).toBe(80_111_000_000);
  expect(v.equity.value).toBe(112_093_000_000);
  expect(v.sharesOutstanding.value).toBe(14_532_182_000);
  expect(v.revenueTTM.provenance).toMatchObject({
    source: "sec",
    asOf: "2026-09-26",
    url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/",
  });
  expect(v.revenueTTM.provenance.note).toContain("FY2026 (10-K)");
  expect(b.revenueHistory.at(-1)).toMatchObject({ fiscalYear: 2026, value: 478_834_000_000 });
  expect(b.revenueHistory.find((p) => p.fiscalYear === 2023)?.value).toBe(383_285_000_000);
  expect(b.revenueHistory.length).toBeLessThanOrEqual(10);
  // AAPL stopped tagging interest expense; it must be unavailable, not stale.
  expect(v.interestExpenseTTM.value).toBeNull();
});

test("MSFT: TTM sums four quarters, deriving the June quarter from the 10-K", () => {
  const v = base("msft").values;
  // FY2026 331,839 + Q1 FY27 92,279 - Q1 FY26 77,673
  expect(v.revenueTTM.value).toBe(346_445_000_000);
  expect(v.revenueTTM.provenance.note).toMatch(/^TTM to 2026-09-30 \(10-Q\); quarter\(s\) to 2026-06-30 derived/);
  expect(v.netIncomeTTM.value).toBe(142_631_000_000);
  expect(v.operatingCashFlowTTM.value).toBe(195_878_000_000);
  expect(v.capexTTM.value).toBe(135_921_000_000);
});

test("AAPL snapshot ratios are computed from sourced inputs", () => {
  const s = buildSnapshot("AAPL", base("aapl"), { sic: "3571", sicDescription: "Electronic Computers", fiscalYearEnd: "0925", exchanges: ["Nasdaq"] }, quote("AAPL", 300), CLOSED_NOW);
  const m = s.metrics;
  expect(s.price.provenance).toMatchObject({ source: "cnbc", session: "closed" });
  expect(m.marketCap.value).toBeCloseTo(300 * 14_532_182_000, 0);
  expect(m.netDebt.value).toBe(80_111_000_000 - 56_722_000_000);
  expect(m.enterpriseValue.value).toBeCloseTo(300 * 14_532_182_000 + 23_389_000_000, 0);
  expect(m.pe.value).toBeCloseTo(300 / 8.98, 6);
  expect(m.fcfTTM.value).toBe(136_056_000_000);
  expect(m.ebitdaTTM.value).toBe(171_486_000_000);
  expect(m.grossMarginTTM.value).toBeCloseTo(233_602 / 478_834, 9);
  expect(m.revenueGrowthTTM.value).toBeCloseTo(478_834 / 416_161 - 1, 9);
  expect(m.effectiveTaxRate.value).toBeCloseTo(27_062 / 159_237, 9);
  expect(m.interestCoverage.value).toBeNull();
  expect(m.pe.provenance.source).toBe("model");
  expect(m.pe.provenance.note).toContain("price: CNBC");
  expect(m.roic.formula).toContain("approx");
  expect(s.currencyMismatch).toBe(false);
});

test("non-positive EPS gives a null P/E, and a missing quote nulls only price-based metrics", () => {
  const b = base("aapl");
  const negative = { ...b, values: { ...b.values, epsDilutedTTM: { ...b.values.epsDilutedTTM, value: -1 } } };
  expect(buildSnapshot("AAPL", negative, null, quote("AAPL", 300)).metrics.pe.value).toBeNull();
  const noQuote = buildSnapshot("AAPL", b, null, null);
  expect(noQuote.price.value).toBeNull();
  expect(noQuote.metrics.marketCap.value).toBeNull();
  expect(noQuote.metrics.netMarginTTM.value).not.toBeNull();
});

test("GOOGL: no cover-page share count falls back to diluted weighted shares, gross profit from cost of revenue", () => {
  const b = base("googl");
  expect(b.values.sharesOutstanding.value).toBe(12_368_000_000);
  expect(b.values.sharesOutstanding.formula).toContain("WeightedAverageNumberOfDilutedSharesOutstanding");
  expect(b.warnings.join(" ")).toContain("weighted-average");
  expect(b.values.grossProfitTTM.provenance.source).toBe("model");
  expect(b.values.grossProfitTTM.formula).toContain("CostOfRevenue");
});

test("ASML: EUR filings with a USD quote withhold price-based metrics", () => {
  const b = base("asml");
  expect(b.currency).toBe("EUR");
  expect(b.values.revenueTTM.provenance.note).toContain("(20-F)");
  const s = buildSnapshot("ASML", b, null, quote("ASML", 1266.22));
  expect(s.currencyMismatch).toBe(true);
  expect(s.metrics.marketCap.value).toBeNull();
  expect(s.metrics.pe.value).toBeNull();
  expect(s.metrics.evToSales.value).toBeNull();
  expect(s.metrics.operatingMarginTTM.value).not.toBeNull();
});

test("financial companies get no EV or leverage metrics", () => {
  const s = buildSnapshot("AAPL", base("aapl"), { sic: "6021", sicDescription: "National Commercial Banks", fiscalYearEnd: null, exchanges: [] }, quote("AAPL", 300, "USD", "REG_MKT"));
  expect(s.financialCompany).toBe(true);
  // Session comes from the NYSE calendar at run time, not from CNBC curmktstatus.
  expect(["regular", "pre", "post", "closed"]).toContain(s.price.provenance.session);
  expect(s.metrics.enterpriseValue.value).toBeNull();
  expect(s.metrics.debtToEquity.value).toBeNull();
  expect(s.metrics.marketCap.value).not.toBeNull();
});

test("IFRS-only filers are unsupported, not an error", () => {
  const r = normalizeFundamentals(facts("tsm"));
  expect(r.kind).toBe("unsupported");
  if (r.kind === "unsupported") expect(r.reason).toContain("IFRS");
});

test("SONY: a filer that moved from US GAAP to IFRS is unsupported, not served stale figures", () => {
  const sony = facts("sony");
  const r = normalizeFundamentals(sony, "2026-11-21");
  expect(r.kind).toBe("unsupported");
  if (r.kind === "unsupported") expect(r.reason).toMatch(/moved to IFRS.*US GAAP data ends 2021-03-31/);
  // Without IFRS evidence, figures more than 18 months old are still refused.
  const gaapOnly = { ...sony, latestEnds: { "us-gaap": "2021-03-31" }, facts: { "us-gaap": sony.facts["us-gaap"] } };
  const stale = normalizeFundamentals(gaapOnly, "2026-11-21");
  expect(stale.kind).toBe("unsupported");
  if (stale.kind === "unsupported") expect(stale.reason).toContain("more than 18 months ago");
  expect(normalizeFundamentals(gaapOnly, "2021-12-31").kind).toBe("ok");
});

test("HD: January/February year ends give one point per fiscal year, labelled the company's way", () => {
  const h = base("hd").revenueHistory;
  const ends = h.map((p) => p.periodEnd);
  expect(new Set(ends).size).toBe(ends.length);
  expect(new Set(h.map((p) => p.fiscalYear)).size).toBe(h.length);
  // HD calls the year ending 2026-02-01 fiscal 2025; the year ending 2019-02-03 must not be dropped.
  expect(h.at(-1)).toMatchObject({ fiscalYear: 2025, periodEnd: "2026-02-01", value: 164_683_000_000 });
  expect(h.find((p) => p.periodEnd === "2019-02-03")).toMatchObject({ fiscalYear: 2018, value: 108_203_000_000 });
  expect(h.find((p) => p.periodEnd === "2018-01-28")?.fiscalYear).toBe(2017);
  const s = buildSnapshot("HD", base("hd"), null, null);
  // FY2025 (to 2026-02-01) over FY2022 (to 2023-01-29): 52/53-week years drift a few days.
  expect(s.metrics.revenueCagr3y.value).toBeCloseTo((164_683 / 157_403) ** (1 / 3) - 1, 9);
});

test("CRM: the latest fiscal year is kept even when SEC labels it with last year's fy", () => {
  const h = base("crm").revenueHistory;
  expect(h.at(-1)).toMatchObject({ fiscalYear: 2026, periodEnd: "2026-01-31", value: 41_525_000_000 });
  expect(h.find((p) => p.periodEnd === "2025-01-31")?.fiscalYear).toBe(2025);
  const cagr = buildSnapshot("CRM", base("crm"), null, null).metrics.revenueCagr3y;
  expect(cagr.provenance.note).toContain("to 2026-01-31");
  expect(cagr.provenance.note).toContain("to 2023-01-31");
  expect(cagr.value).toBeCloseTo((41_525 / 31_352) ** (1 / 3) - 1, 9);
});

test("total debt is withheld when only the current portion of long-term debt is tagged", () => {
  const usd = (end: string, val: number, extra: Record<string, unknown> = {}) => ({ units: { USD: [{ end, val, accn: "a1", form: "10-K", filed: "2026-03-01", fy: 2025, fp: "FY", ...extra }] } });
  const end = "2025-12-31";
  const raw = (debt: Record<string, unknown>): CompanyFactsRaw => ({
    cik: 1,
    entityName: "Test Co",
    facts: {
      "us-gaap": {
        Revenues: usd(end, 1_000, { start: "2025-01-01" }),
        StockholdersEquity: usd(end, 500),
        ...debt,
      } as CompanyFactsRaw["facts"][string],
    },
  });
  const partial = normalizeFundamentals(raw({ LongTermDebtCurrent: usd(end, 50), CommercialPaper: usd(end, 20) }));
  if (partial.kind !== "ok") throw new Error("expected ok");
  expect(partial.base.values.totalDebt.value).toBeNull();
  expect(partial.base.values.totalDebt.reason).toContain("current portion");

  const both = normalizeFundamentals(raw({ LongTermDebt: usd(end, 300), CommercialPaper: usd(end, 20), ShortTermBorrowings: usd(end, 45) }));
  if (both.kind !== "ok") throw new Error("expected ok");
  expect(both.base.values.totalDebt.value).toBe(320);
  expect(both.base.warnings.join(" ")).toContain("short-term borrowings");
});
