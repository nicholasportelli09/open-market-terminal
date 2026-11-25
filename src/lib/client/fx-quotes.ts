import { majorCurrency, type Currency, type FxMap, type PriceMap } from "@/lib/portfolio";
import { instrumentSession, quoteProvenance } from "@/lib/market-session";
import type { Quote } from "@/lib/types";

/** CNBC spot symbol for a currency against USD ("EUR=" is EUR/USD, "JPY=" is USD/JPY). */
export function fxSymbol(currency: Currency): string | null {
  return currency === "USD" ? null : `${currency}=`;
}

/**
 * USD per one unit of `currency` from its CNBC quote, reading the pair direction from the quote
 * name ("EUR/USD" -> last, "USD/JPY" -> 1 / last). Returns null when the direction is unclear,
 * so an unknown convention is reported as a missing rate instead of guessed.
 */
export function usdPerUnit(currency: Currency, quote: Quote | undefined): number | null {
  if (currency === "USD") return 1;
  if (!quote || quote.last == null || !(quote.last > 0)) return null;
  const name = quote.name.toUpperCase().replace(/\s+/g, "");
  if (name.startsWith(`${currency}/USD`)) return quote.last;
  if (name.startsWith(`USD/${currency}`)) return 1 / quote.last;
  const words = quote.name.toUpperCase();
  if (words.startsWith("US DOLLAR/")) return 1 / quote.last;
  return null;
}

/** Base-currency rates for `currencies`, crossed through USD. Missing rates are simply absent. */
export function fxMapFromQuotes(base: Currency, currencies: Currency[], quotes: Record<string, Quote | undefined>, now: Date): FxMap {
  const out: FxMap = {};
  const baseSym = fxSymbol(base);
  const baseQuote = baseSym ? quotes[baseSym] : undefined;
  const usdPerBase = usdPerUnit(base, baseQuote);
  if (usdPerBase == null) return out;
  for (const c of currencies) {
    if (c === base) continue;
    const sym = fxSymbol(c);
    const q = sym ? quotes[sym] : undefined;
    const usdPer = usdPerUnit(c, q);
    if (usdPer == null) continue;
    const stamps = [q, baseQuote].filter((x): x is Quote => !!x).map((x) => quoteProvenance(x, now).asOf).filter(Boolean).sort();
    out[c] = { rateToBase: usdPer / usdPerBase, asOf: stamps[0] ?? now.toISOString(), source: "cnbc" };
  }
  return out;
}

/** Engine price inputs from live CNBC quotes (regular-session last; extended-hours prices are not used). */
export function priceMapFromQuotes(symbols: string[], quotes: Record<string, Quote | undefined>, now: Date): PriceMap {
  const out: PriceMap = {};
  for (const s of symbols) {
    const q = quotes[s];
    if (!q || q.last == null || !q.currency) continue;
    const prov = quoteProvenance(q, now);
    const unit = majorCurrency(q.currency);
    out[s] = {
      price: q.last / unit.divisor,
      currency: unit.currency,
      asOf: prov.asOf || now.toISOString(),
      session: instrumentSession(q, now),
      source: q.source ?? "cnbc",
      previousClose: q.prevClose != null ? q.prevClose / unit.divisor : undefined,
    };
  }
  return out;
}
