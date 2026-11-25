/**
 * Scanner universe: S&P 100 constituents.
 *
 * Verified 2026-11-21 against (1) the Wikipedia S&P 100 constituents table, itself dated 2026-09-21 and sourced
 * to the iShares S&P 100 ETF (OEF) holdings, and (2) the S&P Dow Jones Indices press release of 2026-09-04 for
 * the 2026-09-21 rebalance (added DELL, PANW, ANET, SNDK; removed HONA, NKE, SPG, CL). No S&P 100 change was
 * announced between that rebalance and 2026-11-22 (re-checked 2026-11-22: Wikipedia table and S&P DJI releases).
 *
 * The index has 100 companies but 101 tickers: Alphabet is in it with both share classes (GOOGL and GOOG).
 * Symbols use the quote convention (dot for class shares: BRK.B).
 */

export const UNIVERSE_AS_OF = "2026-09-21";
export const UNIVERSE_VERIFIED_ON = "2026-11-22";
export const UNIVERSE_NAME = "S&P 100";
export const UNIVERSE_SOURCE_NOTE =
  "S&P 100 constituents as of the 2026-09-21 rebalance (S&P Dow Jones Indices release of 2026-09-04; iShares OEF holdings). Checked for later changes on 2026-11-22.";
export const UNIVERSE_SOURCE_URL =
  "https://press.spglobal.com/2026-09-04-Bloom-Energy,-Illumina,-and-Everpure-Set-to-Join-S-P-500-Others-to-Join-S-P-100,-S-P-MidCap-400,-and-S-P-SmallCap-600";

/** Tickers that are a second share class of a company already listed (same issuer). */
export const SHARE_CLASS_PAIRS: Readonly<Record<string, string>> = { GOOG: "GOOGL" };

export const SP100: readonly string[] = [
  "AAPL", "ABBV", "ABT", "ACN", "ADBE", "AMAT", "AMD", "AMGN", "AMT", "AMZN",
  "ANET", "AVGO", "AXP", "BA", "BAC", "BKNG", "BLK", "BMY", "BNY", "BRK.B",
  "C", "CAT", "CMCSA", "COF", "COP", "COST", "CRM", "CSCO", "CVS", "CVX",
  "DE", "DELL", "DHR", "DIS", "DUK", "EMR", "FDX", "GD", "GE", "GEV",
  "GILD", "GM", "GOOG", "GOOGL", "GS", "HD", "IBM", "INTC", "INTU", "ISRG",
  "JNJ", "JPM", "KO", "LIN", "LLY", "LMT", "LOW", "LRCX", "MA", "MCD",
  "MDLZ", "MDT", "META", "MMM", "MO", "MRK", "MS", "MSFT", "MU", "NEE",
  "NFLX", "NOW", "NVDA", "ORCL", "PANW", "PEP", "PFE", "PG", "PLTR", "PM",
  "QCOM", "RTX", "SBUX", "SCHW", "SNDK", "SO", "T", "TMO", "TMUS", "TSLA",
  "TXN", "UBER", "UNH", "UNP", "UPS", "USB", "V", "VZ", "WFC", "WMT",
  "XOM",
];

export const MAX_EXTRA_TICKERS = 20;

/** US ticker shape: 1-5 letters, optional class suffix (BRK.B, BF-B). */
const US_TICKER_RE = /^[A-Z]{1,5}(?:[.-][A-Z]{1,2})?$/;

/** Normalises a user-typed ticker to the quote convention, or null when it is not a plausible US ticker. */
export function normalizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace("/", ".").replace("-", ".");
  return US_TICKER_RE.test(t) ? t : null;
}

/** Valid, de-duplicated extras that are not already in the universe, capped at MAX_EXTRA_TICKERS. */
export function cleanExtras(list: readonly string[]): string[] {
  const out: string[] = [];
  const base = new Set(SP100);
  for (const raw of list) {
    const t = normalizeTicker(raw);
    if (!t || base.has(t) || out.includes(t)) continue;
    out.push(t);
    if (out.length >= MAX_EXTRA_TICKERS) break;
  }
  return out;
}
