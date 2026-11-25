/**
 * Link to a stock's page on stockanalysis.com. URL formats were checked against the live site
 * (2026-11-24): US "/stocks/aapl/" (ETFs redirect to "/etf/spy/"), US OTC "/quote/otc/SOBKY/", US mutual
 * funds "/quote/mutf/VFIAX/", and "/quote/{exchange}/{ticker}/" elsewhere. Where CNBC's ticker is not the
 * local one (Singapore "DBSM" for D05, Brazil "VALE" for VALE3) or the venue is unknown, it falls back to the
 * site's symbol lookup. ETNs get no link (the site does not cover them).
 */
import type { Quote } from "@/lib/types";

const BASE = "https://stockanalysis.com";

type LinkQuote = Pick<Quote, "symbol" | "type" | "exchange" | "country">;

/** stockanalysis.com exchange slug by CNBC country code, for countries with one main venue and CNBC tickers that match local ones. */
const COUNTRY_SLUG: Record<string, string> = {
  GB: "lon",
  CH: "swx",
  FR: "epa",
  NL: "ams",
  BE: "ebr",
  AU: "asx",
  ES: "bme",
  IT: "bit",
  NO: "osl",
  FI: "hel",
  SE: "sto",
  DK: "cph",
  TW: "tpe",
  MX: "bmv",
  ZA: "jse",
  PL: "wse",
  TR: "ist",
  ID: "idx",
  AT: "vie",
  IE: "ise",
  IL: "tlv",
  CO: "bvc",
};

const LINKABLE_TYPES = new Set(["STOCK", "ETF", "FUND"]);
const US_EXCHANGE = /NASDAQ|NYSE|Cboe|BATS|AMEX/i;
const OTC = /OTC|Over The Counter|Pink/i;

/** "9984.T-JP" -> "9984.T", "HSBA-GB" -> "HSBA", "BP.-GB" -> "BP" (CNBC's trailing dot), "BRK.B" stays. */
function baseTicker(symbol: string): string {
  return symbol.replace(/-[A-Z]{2,3}$/, "").replace(/\.$/, "");
}

/** Local exchange code shapes, for venues where CNBC often uses its own tickers instead. */
const LOCAL_SHAPE: Record<string, { slug: string; re: RegExp }> = {
  SG: { slug: "sgx", re: /^[A-Z0-9]\d{2}[A-Z]?$/ }, // D05, O39, C6L
  BR: { slug: "bvmf", re: /^[A-Z]{4}\d{1,2}$/ }, // VALE3, PETR4, TAEE11
};

function quotePath(slug: string, ticker: string): string {
  return `${BASE}/quote/${slug}/${encodeURIComponent(ticker)}/`;
}

function lookup(ticker: string): string {
  return `${BASE}/symbol-lookup/?q=${encodeURIComponent(ticker)}`;
}

/** Page for this listing, or null for instruments that are not shares or funds (indices, FX, bonds). */
export function stockAnalysisUrl(q: LinkQuote): string | null {
  if (!LINKABLE_TYPES.has(q.type.toUpperCase())) return null;
  const ticker = baseTicker(q.symbol);
  const country = q.country || (US_EXCHANGE.test(q.exchange) || OTC.test(q.exchange) ? "US" : "");
  switch (country) {
    case "US":
      if (OTC.test(q.exchange)) return quotePath("otc", ticker);
      if (q.type.toUpperCase() === "FUND") return quotePath("mutf", ticker);
      return US_EXCHANGE.test(q.exchange) || !q.exchange ? `${BASE}/stocks/${encodeURIComponent(ticker.toLowerCase())}/` : lookup(ticker);
    case "KR":
      if (q.type.toUpperCase() !== "STOCK") return lookup(ticker); // Korean ETFs: not confirmed on the site
      return quotePath(/KOSDAQ/i.test(q.exchange) ? "kosdaq" : "krx", ticker);
    case "JP":
      return quotePath("tyo", ticker.replace(/\.T$/, ""));
    case "HK":
      return /^\d+$/.test(ticker) ? quotePath("hkg", ticker.padStart(4, "0")) : lookup(ticker);
    case "CN":
      return quotePath(/Shanghai/i.test(q.exchange) || ticker.startsWith("6") ? "sha" : "she", ticker);
    case "DE":
      return quotePath(/Frankfurt/i.test(q.exchange) ? "fra" : "etr", ticker);
    case "IN":
      return quotePath(/Bombay|BSE/i.test(q.exchange) ? "bom" : "nse", ticker);
    case "CA":
      return quotePath(/Venture/i.test(q.exchange) ? "tsxv" : "tsx", ticker);
    case "SG":
    case "BR":
      return LOCAL_SHAPE[country].re.test(ticker) ? quotePath(LOCAL_SHAPE[country].slug, ticker) : lookup(ticker);
    default:
      return COUNTRY_SLUG[country] ? quotePath(COUNTRY_SLUG[country], ticker) : lookup(ticker);
  }
}
