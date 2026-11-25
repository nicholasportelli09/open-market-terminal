import type { Bar, ExtendedQuote, Quote, SearchResult } from "@/lib/types";
import { cached } from "./cache";
import { fetchKrChart, fetchKrQuotes, isKrSymbol } from "./naver";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const QUOTE_URL = "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol";
const CHART_URL = "https://ts-api.cnbc.com/harmony/app/charts";
const SEARCH_URL = "https://symlookup.cnbc.com/symservice/symlookup.do";
const QUOTE_TTL_MS = 2_000;
const QUOTE_CHUNK = 40;
const FETCH_TIMEOUT_MS = 8_000;
const OUTLIER_RATIO = 0.1;

const FUNDAMENTAL_KEYS = [
  "pe", "fpe", "eps", "feps", "mktcapView", "dividend", "dividendyield", "beta", "tendayavgvol",
  "yrhiprice", "yrhidate", "yrloprice", "yrlodate", "sharesout", "revenuettm", "psales",
  "ROETTM", "NETPROFTTM", "GROSMGNTTM", "TTMEBITD", "DEBTEQTYQ",
] as const;

type Raw = Record<string, unknown>;

const RETRY_DELAY_MS = 250;

async function fetchOnce(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

/** CNBC intermittently fails (5xx or reset); one short retry hides most of these blips. */
async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchOnce(url);
    if (res.status >= 500) throw new Error(`Upstream ${res.status}`);
  } catch {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    res = await fetchOnce(url);
  }
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function num(v: unknown): number | null {
  const s = str(v).replace(/[,%+\s$]/g, "");
  if (!s || s === "UNCH") return s === "UNCH" ? 0 : null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function decimalsOf(v: unknown): number {
  const m = str(v).replace(/%$/, "").match(/\.(\d+)$/);
  return m ? m[1].length : 0;
}

function toExtended(raw: unknown): ExtendedQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return {
    type: str(r.type),
    last: num(r.last),
    change: num(r.change),
    changePct: num(r.change_pct),
    time: str(r.last_time) || null,
    timeText: str(r.last_timedate),
  };
}

/**
 * CNBC's change_pct for government bonds is a price-based figure whose sign often disagrees with
 * the yield change (e.g. US30Y change -0.064 with change_pct +0.957%). For yields, the percent change
 * is recomputed from CNBC's own yield change and previous close, so sign and colour always agree.
 */
function yieldChangePct(change: number | null, prevClose: number | null): number | null {
  if (change === null || prevClose === null || prevClose === 0) return null;
  return (change / prevClose) * 100;
}

/** CNBC sends "0.0000" for open/high/low it does not have (FX pairs on weekends); show them as missing. */
function missingIfZero(v: number | null, last: number | null): number | null {
  return v === 0 && last !== null && last > 0 ? null : v;
}

function toQuote(r: Raw): Quote {
  const fundamentals: Record<string, string> = {};
  for (const key of FUNDAMENTAL_KEYS) {
    const v = str(r[key]);
    if (v) fundamentals[key] = v;
  }
  const events: Record<string, string> = {};
  if (r.EventData && typeof r.EventData === "object") {
    for (const [k, v] of Object.entries(r.EventData as Raw)) events[k] = str(v);
  }
  const lastRaw = str(r.last);
  const isYield = lastRaw.endsWith("%");
  const change = num(r.change);
  const prevClose = num(r.previous_day_closing);
  const last = num(r.last);
  return {
    symbol: str(r.symbol),
    name: str(r.name) || str(r.symbol),
    type: str(r.type),
    exchange: str(r.exchange),
    country: str(r.countryCode),
    // Empty when CNBC does not say (FX pairs, bonds); never assume USD.
    currency: str(r.currencyCode),
    last,
    change,
    changePct: isYield ? yieldChangePct(change, prevClose) : num(r.change_pct),
    decimals: decimalsOf(lastRaw),
    isYield,
    open: missingIfZero(num(r.open), last),
    high: missingIfZero(num(r.high), last),
    low: missingIfZero(num(r.low), last),
    prevClose,
    volume: num(r.volume),
    time: str(r.last_time) || null,
    timeText: str(r.last_timedate),
    marketStatus: str(r.curmktstatus),
    delayed: str(r.realTime) === "false",
    fundamentals,
    events,
    extended: toExtended(r.ExtendedMktQuote),
  };
}

async function fetchQuoteChunk(symbols: string[]): Promise<Quote[]> {
  const params = new URLSearchParams({
    symbols: symbols.join("|"),
    requestMethod: "itv",
    noform: "1",
    partnerId: "2",
    fund: "1",
    exthrs: "1",
    output: "json",
    events: "1",
  });
  const data = (await getJson(`${QUOTE_URL}?${params}`)) as Raw;
  const result = (data.FormattedQuoteResult as Raw | undefined)?.FormattedQuote;
  const list = Array.isArray(result) ? result : result ? [result] : [];
  return (list as Raw[]).filter((q) => q.code === 0 || q.code === "0").map(toQuote);
}

/**
 * Quotes for any app symbol. Korean shares ("005930-KR") come from Naver (CNBC has none); everything else
 * from CNBC. When both are asked for, a Naver failure only drops the Korean quotes.
 */
export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols)];
  const kr = unique.filter(isKrSymbol);
  const rest = unique.filter((s) => !isKrSymbol(s));
  if (kr.length === 0) return fetchCnbcQuotes(rest);
  if (rest.length === 0) return fetchKrQuotes(kr);
  const [a, b] = await Promise.all([fetchCnbcQuotes(rest), fetchKrQuotes(kr).catch(() => [] as Quote[])]);
  return [...a, ...b];
}

async function fetchCnbcQuotes(unique: string[]): Promise<Quote[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += QUOTE_CHUNK) chunks.push(unique.slice(i, i + QUOTE_CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) => cached(`q:${chunk.join("|")}`, QUOTE_TTL_MS, () => fetchQuoteChunk(chunk))),
  );
  return results.flat();
}

export type RawChart = {
  bars: Bar[];
  timeZone: string;
  /** Exchange UTC offset in hours; bar times are always New York time. */
  utcOffset: number | null;
  sessionOpen: string | null;
  sessionClose: string | null;
};

/** "20261120112000" -> seconds, keeping exchange wall-clock time (encoded as UTC). */
function parseTradeTime(s: string): number {
  const d = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
  return Math.floor(d / 1000);
}

/**
 * CNBC sends "0.0000" for missing open/high/low and some bars whose open/close sit outside
 * high-low. Treat zeros as missing (when the close is positive) and widen high/low to cover the body.
 */
function sanitizeBar(o: number | null, h: number | null, l: number | null, c: number, prevClose: number | null) {
  const missing = (v: number | null) => v === null || (c > 0 && v <= 0);
  const open = missing(o) ? (prevClose ?? c) : (o as number);
  const bodyLow = Math.min(open, c);
  const bodyHigh = Math.max(open, c);
  // Bad ticks: a wick 90% below or 10x above the body is a data error, not a real move.
  const badLow = missing(l) || (bodyLow > 0 && (l as number) < bodyLow * OUTLIER_RATIO);
  const badHigh = missing(h) || (bodyHigh > 0 && (h as number) > bodyHigh / OUTLIER_RATIO);
  const high = Math.max(badHigh ? c : (h as number), open, c);
  const low = Math.min(badLow ? c : (l as number), open, c);
  return { o: open, h: high, l: low, c };
}

export async function fetchChart(symbol: string, source: string, ttlMs: number): Promise<RawChart> {
  if (isKrSymbol(symbol)) return fetchKrChart(symbol, source, ttlMs);
  return cached(`c:${symbol}:${source}`, ttlMs, async () => {
    const data = (await getJson(`${CHART_URL}/${source}.json?symbol=${encodeURIComponent(symbol)}`)) as Raw;
    const barData = (data.barData ?? {}) as Raw;
    const exchange = (barData.exchange ?? {}) as Raw;
    const priceBars = Array.isArray(barData.priceBars) ? (barData.priceBars as Raw[]) : [];
    const bars: Bar[] = [];
    for (const b of priceBars) {
      const c = num(b.close);
      const tt = str(b.tradeTime);
      if (c === null || tt.length < 12) continue;
      const bar = sanitizeBar(num(b.open), num(b.high), num(b.low), c, bars[bars.length - 1]?.c ?? null);
      bars.push({ t: parseTradeTime(tt), ...bar, v: num(b.volume) ?? 0 });
    }
    bars.sort((a, b) => a.t - b.t);
    return {
      bars,
      timeZone: str(exchange.timeZone) || "EST",
      utcOffset: num(exchange.offset),
      sessionOpen: str(exchange.exchangeOpenTime) || null,
      sessionClose: str(exchange.exchangeCloseTime) || null,
    };
  });
}

/** CNBC's own symbol lookup (at most ~11 matches). symbol-search.ts merges and ranks it with other sources. */
export async function searchCnbc(query: string): Promise<SearchResult[]> {
  return cached(`s:${query.toLowerCase()}`, 300_000, async () => {
    const params = new URLSearchParams({ prefix: query, partnerid: "20064", fund: "1", output: "json" });
    const data = await getJson(`${SEARCH_URL}?${params}`);
    if (!Array.isArray(data)) return [];
    return (data as Raw[])
      .filter((r) => r.symbolName)
      .map((r) => ({
        symbol: str(r.symbolName),
        name: str(r.companyName),
        type: str(r.issueType),
        exchange: str(r.exchangeName),
      }));
  });
}
