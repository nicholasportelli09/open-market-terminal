import type { CompanySnapshotResult } from "@/lib/company-types";
import type { Quote } from "@/lib/types";
import { fetchQuotes } from "./cnbc";
import { buildSnapshot, type QuoteInput } from "./company-metrics";
import { companyFacts, companySubmissions, secTicker, tickerToCik, type CompanyProfile } from "./sec";
import { normalizeFundamentals } from "./sec-fundamentals";

/** CNBC writes class shares with a dot (BRK.B); SEC with a dash (BRK-B). */
export function quoteSymbol(symbol: string): string {
  return secTicker(symbol).replace(/-/g, ".");
}

function toQuoteInput(q: Quote): QuoteInput {
  return { symbol: q.symbol, last: q.last, currency: q.currency, marketStatus: q.marketStatus, time: q.time, timeText: q.timeText, type: q.type, exchange: q.exchange, delayed: q.delayed };
}

async function quoteFor(symbol: string): Promise<QuoteInput | null> {
  try {
    const [q] = await fetchQuotes([symbol]);
    return q ? toQuoteInput(q) : null;
  } catch (err) {
    // A missing price only nulls the price-based metrics; the fundamentals still stand.
    console.error("[company] quote failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The profile only adds SIC and exchanges; a failed lookup must not fail a snapshot whose facts loaded. */
async function profileFor(cik: string): Promise<CompanyProfile | null> {
  try {
    return await companySubmissions(cik);
  } catch (err) {
    console.error("[company] submissions failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Normalized company snapshot: CNBC price + SEC fundamentals with provenance on every figure.
 * Returns not_found / unsupported as values; throws SecError when SEC itself fails.
 */
export async function companySnapshot(symbol: string): Promise<CompanySnapshotResult> {
  const entry = await tickerToCik(symbol);
  if (!entry) return { kind: "not_found", message: `${symbol.toUpperCase()} is not in the SEC ticker list.` };

  const qSymbol = quoteSymbol(symbol);
  const [facts, profile, quote] = await Promise.all([
    companyFacts(entry.cik),
    profileFor(entry.cik),
    quoteFor(qSymbol),
  ]);
  if (!facts) {
    return { kind: "unsupported", message: `${entry.title} has no XBRL financial data at SEC.`, cik: entry.cik, name: entry.title };
  }
  const normalized = normalizeFundamentals(facts, new Date().toISOString().slice(0, 10));
  if (normalized.kind === "unsupported") {
    return { kind: "unsupported", message: normalized.reason, cik: entry.cik, name: facts.entityName || entry.title };
  }
  const snapshot = buildSnapshot(quote?.symbol || qSymbol, normalized.base, profile, quote);
  return { kind: "ok", snapshot };
}
