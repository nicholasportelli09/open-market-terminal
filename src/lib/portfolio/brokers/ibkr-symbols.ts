/**
 * IBKR contract -> this app's quote symbol. Pure. IBKR names a stock by symbol + listing exchange ("SAP" on
 * IBIS, "700" on SEHK); the app uses CNBC-style symbols ("SAP-DE", "700-HK", "9984.T-JP", "000660-KR").
 * candidateSymbols lists likely symbols best first; quoteMatches checks a live quote really is the same line
 * (same currency, price close to IBKR's mark), so a wrong guess is rejected, not imported.
 */
import { majorCurrency } from "../fx";

const US_VENUES = new Set(["NASDAQ", "NYSE", "ARCA", "AMEX", "BATS", "BEX", "IEX", "PINK", "NYSENAT", "ISLAND", "CBOE", "PSX", "OTC", "OTCBB", "IBKRATS"]);

/** Country suffix for exchanges whose CNBC symbol is "<symbol>-<CC>". */
const EXCHANGE_SUFFIX: Record<string, string> = {
  LSE: "GB", LSEETF: "GB", LSEIOB1: "GB",
  IBIS: "DE", IBIS2: "DE", FWB: "DE", FWB2: "DE", GETTEX: "DE", TGATE: "DE", SWB: "DE",
  SBF: "FR", AEB: "NL", "ENEXT.BE": "BE", BVL: "PT", ISED: "IE",
  EBS: "CH", VIRTX: "CH", BVME: "IT", "BVME.ETF": "IT", BM: "ES", VSE: "AT",
  SFB: "SE", OSE: "NO", CPH: "DK", HEX: "FI", WSE: "PL",
  TSE: "CA", VENTURE: "CA", ASX: "AU", NZE: "NZ", SGX: "SG", NSE: "IN", MEXI: "MX", BOVESPA: "BR", JSE: "ZA",
  TWSE: "TW",
};

/** Max price gap between IBKR's mark and the live quote for a name-search match to count as the same line. */
export const SEARCH_PRICE_TOLERANCE = 1.5;
/** Looser for the symbol derived from the exchange itself (allows a split or a big move since the report). */
export const DIRECT_PRICE_TOLERANCE = 3;

export type IbkrContract = {
  symbol: string;
  listingExchange: string;
  currency: string;
  assetCategory: string;
  markPrice: number | null;
};

/** IBKR writes share classes with a space ("BRK B", "VOLV B"); CNBC uses a dot. */
const dotted = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ".");

/** Likely app symbols for a contract, best first, without duplicates. */
export function candidateSymbols(c: IbkrContract): string[] {
  const sym = dotted(c.symbol);
  const ex = c.listingExchange.toUpperCase();
  const out: string[] = [];
  if (c.assetCategory === "CRYPTO") out.push(`${sym}.CM=`);
  else if (ex === "SEHK" && /^\d+$/.test(sym)) out.push(`${Number(sym)}-HK`);
  else if ((ex === "TSEJ" || ex === "TSE.JPN") && /^\d+[A-Z]?$/.test(sym)) out.push(`${sym}.T-JP`);
  else if ((ex === "KSE" || ex === "KOSDAQ") && /^\d+$/.test(sym)) out.push(`${sym.padStart(6, "0")}-KR`);
  else if (/^(SEHKNTL|SEHKSZSE|SSE|SZSE)$/.test(ex) && /^\d+$/.test(sym)) out.push(`${sym}-CN`);
  else if (EXCHANGE_SUFFIX[ex]) out.push(`${sym}-${EXCHANGE_SUFFIX[ex]}`);
  if (US_VENUES.has(ex) || c.currency === "USD") out.push(sym);
  return [...new Set(out)];
}

export type QuoteLike = { symbol: string; currency: string; last: number | null };

/** True when `q` is plausibly the same line as the contract: same currency, price close to IBKR's mark. */
export function quoteMatches(c: IbkrContract, q: QuoteLike, tolerance = SEARCH_PRICE_TOLERANCE): boolean {
  if (q.last === null || !(q.last > 0)) return false;
  const unit = majorCurrency(q.currency);
  if (unit.currency !== c.currency) return false;
  if (c.markPrice === null || !(c.markPrice > 0)) return true;
  const ratio = q.last / unit.divisor / c.markPrice;
  return ratio <= tolerance && ratio >= 1 / tolerance;
}

/**
 * A stand-in symbol for a contract with no live quote: still valid in the ledger (letters, digits, . -), and
 * distinct per exchange so the same ticker on two exchanges never merges into one position.
 */
export function fallbackSymbol(c: IbkrContract): string {
  const sym = dotted(c.symbol).replace(/[^A-Z0-9.\-]/g, "");
  const ex = c.listingExchange.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (ex ? `${sym}-${ex}` : sym).slice(0, 20) || "IBKR";
}
