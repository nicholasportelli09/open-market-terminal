/**
 * Provenance for every financial data point: where it came from, when it was true, and which
 * price session it belongs to. Shared by server routes and client components.
 */

export type SourceId =
  | "cnbc"
  | "naver"
  | "sec"
  | "fred"
  | "nasdaq"
  | "fmp"
  | "finnhub"
  | "google-news"
  | "anthropic"
  | "gemini"
  | "ibkr"
  | "user"
  | "model";

export type SourceInfo = {
  id: SourceId;
  name: string;
  url: string;
  /** How the data may be used, in one line. Shown in source tooltips and the completion report. */
  terms: string;
};

export const SOURCES: Record<SourceId, SourceInfo> = {
  cnbc: { id: "cnbc", name: "CNBC quotes", url: "https://www.cnbc.com/markets/", terms: "Public quote feed; may be delayed for some venues." },
  naver: { id: "naver", name: "Naver Finance", url: "https://finance.naver.com", terms: "Public quote feed for Korean shares (unofficial, no API agreement); prices include Nextrade pre- and after-market trades, and daily closes come from Naver's daily series, which can differ from the KRX closing price used for the day's change." },
  sec: { id: "sec", name: "SEC EDGAR (XBRL)", url: "https://www.sec.gov/edgar", terms: "US government data, public domain; fair-access rate limits apply." },
  fred: { id: "fred", name: "FRED, St. Louis Fed", url: "https://fred.stlouisfed.org", terms: "Public economic data; series-level copyright notes on FRED apply." },
  nasdaq: { id: "nasdaq", name: "Nasdaq.com", url: "https://www.nasdaq.com", terms: "Public website data feed (unofficial, no API agreement)." },
  fmp: { id: "fmp", name: "Financial Modeling Prep", url: "https://site.financialmodelingprep.com", terms: "Licensed API, used under the key holder's plan." },
  finnhub: { id: "finnhub", name: "Finnhub", url: "https://finnhub.io", terms: "Licensed API, used under the key holder's plan." },
  "google-news": { id: "google-news", name: "Google News", url: "https://news.google.com", terms: "Headlines and links to publishers." },
  anthropic: { id: "anthropic", name: "Claude (Anthropic)", url: "https://www.anthropic.com", terms: "AI-generated text; interpretations, not facts." },
  gemini: { id: "gemini", name: "Gemini (Google)", url: "https://ai.google.dev", terms: "AI-generated text; interpretations, not facts." },
  ibkr: { id: "ibkr", name: "Interactive Brokers (Flex report)", url: "https://www.interactivebrokers.com", terms: "Your own account report, read with your Flex token for this request only; the token is not stored on the server." },
  user: { id: "user", name: "Entered by you", url: "", terms: "Data you typed in; stored in this browser and synced to your account when signed in." },
  model: { id: "model", name: "Terminal model", url: "", terms: "Computed by this app from the sourced inputs shown." },
};

/**
 * Price session a value belongs to.
 * regular = regular trading hours; pre / post = extended hours; closed = last regular close;
 * continuous = 24h markets (crypto, most FX); "n/a" = not a traded price (fundamentals, macro).
 */
export type PriceSession = "regular" | "pre" | "post" | "closed" | "continuous" | "n/a";

export type Provenance = {
  source: SourceId;
  /** ISO timestamp (or YYYY-MM-DD for period data) the value was true as of. */
  asOf: string;
  session?: PriceSession;
  /** True when the provider marks the price as delayed rather than real-time. */
  delayed?: boolean;
  /** Deep link to the exact record (filing, series, article) when there is one. */
  url?: string;
  /** Short qualifier, e.g. "TTM to 2026-09-27, 10-Q" or "FRED series DGS10". */
  note?: string;
};

export type Sourced<T> = { value: T; provenance: Provenance };

export function sourced<T>(value: T, provenance: Provenance): Sourced<T> {
  return { value, provenance };
}

export const SESSION_LABEL: Record<PriceSession, string> = {
  regular: "Market hours",
  pre: "Pre-market",
  post: "After hours",
  closed: "At close",
  continuous: "24h market",
  "n/a": "",
};

/** Which feed serves prices for an app symbol: Naver Finance for Korean shares ("005930-KR"), else CNBC. */
export function priceFeedOf(symbol: string): "cnbc" | "naver" {
  return /^[0-9A-Z]{6}-KR$/.test(symbol) ? "naver" : "cnbc";
}

/** Public page for the symbol on its price feed. */
export function priceFeedUrl(symbol: string): string {
  return priceFeedOf(symbol) === "naver"
    ? `https://finance.naver.com/item/main.naver?code=${symbol.slice(0, 6)}`
    : `https://www.cnbc.com/quotes/${encodeURIComponent(symbol)}`;
}
