/**
 * One scanner row: company snapshot (SEC + CNBC price), 1-year risk inputs (CNBC daily closes, CNBC beta) and
 * catalysts (CNBC event dates, SEC 8-Ks). Throws RowError with a plain reason when the company cannot be screened.
 */
import type { CompanySnapshot } from "@/lib/company-types";
import { quoteProvenance } from "@/lib/market-session";
import type { Provenance } from "@/lib/provenance";
import { sectorFor } from "@/lib/scanner/sectors";
import { SNAPSHOT_KEYS, type ScanMetric, type ScanMetricKey, type ScreenRow } from "@/lib/scanner/types";
import type { Quote } from "@/lib/types";
import { fetchChart } from "../cnbc";
import { companySnapshot, quoteSymbol } from "../company";
import { tickerToCik } from "../sec";
import { catalystMetrics, quoteCatalysts, recent8ks } from "./catalysts";
import { checkPe } from "./checks";
import { scannerSubmissions, type Submissions } from "./filings";
import { betaMetric, riskMetrics } from "./risk";

const CHART_TTL_MS = 6 * 3_600_000;

export class RowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowError";
  }
}

export type BuiltRow = { row: ScreenRow; snapshot: CompanySnapshot };

function priceToBook(s: CompanySnapshot): ScanMetric {
  const formula = "P/B = market cap / shareholders' equity (ending balance)";
  const mc = s.metrics.marketCap;
  const eq = s.metrics.equity;
  const asOf = [mc.provenance.asOf, eq.provenance.asOf].sort().at(-1) ?? "";
  const base = { unit: "multiple" as const, formula };
  if (mc.value === null) return { ...base, value: null, provenance: { source: "model", asOf }, reason: `Missing input: market cap${mc.reason ? ` (${mc.reason})` : ""}` };
  if (eq.value === null) return { ...base, value: null, provenance: { source: "model", asOf }, reason: `Missing input: equity${eq.reason ? ` (${eq.reason})` : ""}` };
  if (eq.value <= 0) return { ...base, value: null, provenance: { source: "model", asOf }, reason: "Equity is zero or negative" };
  const note = `Inputs: marketCap: derived; equity: SEC ${eq.provenance.note ?? eq.provenance.asOf}`;
  return { ...base, value: mc.value / eq.value, provenance: { source: "model", asOf, note } };
}

async function submissionsFor(cik: string): Promise<Submissions | null> {
  try {
    return await scannerSubmissions(cik);
  } catch (err) {
    console.error("[scanner] submissions failed", cik, err instanceof Error ? err.message : err);
    return null;
  }
}

async function barsFor(symbol: string) {
  try {
    const chart = await fetchChart(symbol, "1Y", CHART_TTL_MS);
    return { bars: chart.bars, failure: undefined };
  } catch (err) {
    console.error("[scanner] chart failed", symbol, err instanceof Error ? err.message : err);
    return { bars: null, failure: "CNBC price history unavailable" };
  }
}

/** YYYY-MM-DD in New York (the market's calendar). */
export function nyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function buildRow(symbol: string, quote: Quote | null, extra: boolean, now: Date = new Date()): Promise<BuiltRow> {
  const entry = await tickerToCik(symbol);
  if (!entry) throw new RowError(`${symbol} is not in the SEC ticker list.`);
  // Submissions first: it primes the profile cache that companySnapshot reads, so SEC sees one request for it.
  const subs = await submissionsFor(entry.cik);
  const result = await companySnapshot(symbol);
  if (result.kind !== "ok") throw new RowError(result.message);
  const s = result.snapshot;
  const qSymbol = quoteSymbol(symbol);
  const chartUrl = `https://www.cnbc.com/quotes/${encodeURIComponent(qSymbol)}?tab=chart`;
  const { bars, failure } = await barsFor(qSymbol);
  const today = nyToday(now);

  const quoteProv: Provenance | null = quote
    ? { ...quoteProvenance({ symbol: quote.symbol, type: quote.type || "STOCK", exchange: quote.exchange, country: quote.country || "US", time: quote.time, delayed: quote.delayed }, now), asOf: now.toISOString(), url: `https://www.cnbc.com/quotes/${encodeURIComponent(qSymbol)}` }
    : null;
  const filingsProv: Provenance | null = subs ? { source: "sec", asOf: subs.fetchedAt, url: subs.url, note: "EDGAR submissions, recent filings" } : null;

  const catalysts = [
    ...(quote && quoteProv ? quoteCatalysts(quote.events, today, quoteProv) : []),
    ...(subs ? recent8ks(subs.filings, s.cik, today) : []),
  ];
  const snapshotMetrics = Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, s.metrics[k]])) as Record<(typeof SNAPSHOT_KEYS)[number], ScanMetric>;
  const peCheck = checkPe(s.metrics.pe, quote?.fundamentals.pe);
  const metrics: Record<ScanMetricKey, ScanMetric> = {
    ...snapshotMetrics,
    pe: peCheck.pe,
    priceToBook: priceToBook(s),
    ...riskMetrics(bars, chartUrl, failure),
    beta: betaMetric(quote?.fundamentals.beta, quoteProv),
    ...catalystMetrics(catalysts, today, quoteProv, filingsProv),
  };
  const warnings = [...s.warnings, ...(peCheck.warning ? [peCheck.warning] : [])];
  if (!subs) warnings.push("SEC filing list unavailable: 8-K catalysts are missing for this company.");
  if (!quote) warnings.push("No CNBC quote in the batch: beta and event dates are missing.");

  const row: ScreenRow = {
    symbol: s.symbol,
    name: s.name,
    cik: s.cik,
    sector: sectorFor(s.symbol, s.sic),
    sic: s.sic,
    sicDescription: s.sicDescription,
    financialCompany: s.financialCompany,
    currency: s.currency,
    currencyMismatch: s.currencyMismatch,
    price: s.price,
    metrics,
    catalysts,
    ttmPeriodEnd: s.ttmPeriodEnd,
    warnings,
    extra,
  };
  return { row, snapshot: s };
}
