export type Quote = {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  /** ISO country code from the feed (CNBC `countryCode`), "" when not given. Used to pick the session. */
  country: string;
  currency: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
  decimals: number;
  isYield: boolean;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  /** Last update: ISO timestamp with offset, or a bare YYYY-MM-DD (indices and stocks after the close). */
  time: string | null;
  timeText: string;
  /** CNBC `curmktstatus`. Unreliable (REG_MKT on weekends); use `instrumentSession` from market-session.ts. */
  marketStatus: string;
  /** True when CNBC marks the quote as not real-time (`realTime: "false"`). */
  delayed: boolean;
  fundamentals: Record<string, string>;
  events: Record<string, string>;
  extended: ExtendedQuote | null;
  /** Feed the quote came from; absent means CNBC. Korean shares come from Naver Finance. */
  source?: "naver";
};

export type ExtendedQuote = {
  type: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
  /** ISO timestamp or bare YYYY-MM-DD of the extended-hours price. */
  time: string | null;
  timeText: string;
};

/** Bar time is the exchange's local wall-clock time encoded as UTC seconds. */
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export const RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;
export type Range = (typeof RANGES)[number];

export type ChartPayload = {
  symbol: string;
  range: Range;
  /** All history available at this resolution (oldest first); the selected range is its tail. */
  bars: Bar[];
  /** Time of the first bar inside the selected range; earlier bars are scroll-back history. */
  presetStart: number | null;
  /** Step between bars in seconds (median), used for candle aggregation. */
  step: number;
  /** End of the current session (same time encoding as bars), when the asset has one. */
  sessionEnd: number | null;
  timeZone: string;
};

export type SearchResult = { symbol: string; name: string; type: string; exchange: string };

export type NewsItem = { title: string; link: string; source: string; published: string };

export type EconEvent = { time: string; country: string; event: string; actual: string; consensus: string; previous: string };

export type EarningsItem = {
  symbol: string;
  name: string;
  /** "pre" = before the open, "post" = after the close, "" = not given. */
  when: "pre" | "post" | "";
  eps: string;
  epsForecast: string;
  surprisePct: number | null;
  marketCap: number | null;
};

export type StatementRow = { label: string; values: string[]; section: boolean };
export type Statement = { id: "income" | "balance" | "cashflow" | "ratios"; label: string; periods: string[]; rows: StatementRow[] };

export type Fundamentals = { statements: Statement[] };

/** Reference closes for trailing returns; the client divides the live price by these. */
export type Performance = { symbol: string; bases: { label: string; close: number }[] };
