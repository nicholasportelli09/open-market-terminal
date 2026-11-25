/**
 * Korean shares (KOSPI, KOSDAQ) from Naver Finance's public JSON feeds. CNBC carries the KOSPI index
 * but no individual Korean stocks, so symbols like "005930-KR" are routed here by cnbc.ts.
 *
 * Shapes match the CNBC adapter: `Quote` for quotes, `RawChart` for bars. Bar times follow the CNBC
 * convention (New York wall-clock time encoded as UTC seconds; daily bars at 00:00 of the trading date).
 * Names are English when the company is in asia-listings.ts, otherwise Naver's Korean name.
 */
import { asiaListing } from "@/lib/asia-listings";
import type { Bar, Quote, SearchResult } from "@/lib/types";
import { cached } from "./cache";
import type { RawChart } from "./cnbc";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const REALTIME_URL = "https://polling.finance.naver.com/api/realtime/domestic/stock";
const BASIC_URL = "https://m.stock.naver.com/api/stock";
const KIND_TTL_MS = 24 * 3_600_000;
const CHART_URL = "https://api.stock.naver.com/chart/domestic/item";
const SEARCH_URL = "https://ac.stock.naver.com/ac";
const FETCH_TIMEOUT_MS = 8_000;
const QUOTE_TTL_MS = 2_000;
const QUOTE_CHUNK = 40;
const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;
/** Intraday window, Seoul time (HHmm): the KRX session plus Nextrade's after-market, as Naver charts it. */
const DAY_OPEN = "0800";
const DAY_CLOSE = "2000";

const KR_SYMBOL = /^[0-9A-Z]{6}-KR$/;

export function isKrSymbol(symbol: string): boolean {
  return KR_SYMBOL.test(symbol);
}

const codeOf = (symbol: string) => symbol.slice(0, 6);

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function num(v: unknown): number | null {
  const s = str(v).replace(/[,\s%+]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DOWN = new Set(["FALLING", "LOWER_LIMIT"]);
const FLAT = new Set(["EVEN", "UNCHANGED"]);

/** Naver sends the size of the move and its direction separately; returns -1, 0 or 1. */
export function directionSign(name: unknown): number {
  const n = str(name).toUpperCase();
  if (DOWN.has(n)) return -1;
  if (FLAT.has(n)) return 0;
  return 1;
}

export type KrKind = "STOCK" | "ETF" | "ETN";

/** Whether a Korean listing is a share, an ETF or an ETN (Naver's `stockEndType`), cached for a day. */
async function fetchKind(code: string): Promise<KrKind> {
  return cached(`kk:${code}`, KIND_TTL_MS, async () => {
    const data = (await getJson(`${BASIC_URL}/${code}/basic`)) as Raw;
    const t = str(data.stockEndType).toUpperCase();
    return t === "ETF" || t === "ETN" ? t : "STOCK";
  });
}

/** Kinds for several codes; a failed lookup falls back to STOCK rather than failing the quote or search. */
async function fetchKinds(codes: string[]): Promise<Map<string, KrKind>> {
  const kinds = await Promise.all(codes.map((c) => fetchKind(c).catch((): KrKind => "STOCK")));
  return new Map(codes.map((c, i) => [c, kinds[i]]));
}

/**
 * Naver's own session state for the listing: CLOSED, or PRE / REGULAR / POST while it trades
 * (`marketStatusDetailType` and `marketSessionType`). ETFs and ETNs do not trade on Nextrade, so they
 * close at 15:30 while shares continue. Exported for tests.
 */
export function krMarketStatus(r: Raw): "CLOSED" | "PRE" | "REGULAR" | "POST" {
  const detail = str(r.marketStatusDetailType || r.marketStatus).toUpperCase();
  if (detail !== "OPEN") return "CLOSED";
  const session = str(r.marketSessionType);
  if (session === "preMarket") return "PRE";
  if (session === "afterMarket") return "POST";
  return "REGULAR";
}

/** "2026-11-24T17:34:37.093032+09:00" -> millisecond precision, which every Date parser accepts. */
function isoTime(v: unknown): string | null {
  const s = str(v);
  return s ? s.replace(/(\.\d{3})\d+/, "$1") : null;
}

/**
 * One entry of the realtime feed -> Quote. Follows Naver's own display: while Nextrade's pre- or
 * after-market trades, the price is the Nextrade price (`overMarketPriceInfo`), and open/high/low/volume
 * are the integrated KRX + Nextrade figures. Exported for tests.
 */
export function toKrQuote(r: Raw, kind: KrKind = "STOCK"): Quote | null {
  const code = str(r.itemCode);
  const over = (r.overMarketPriceInfo ?? null) as Raw | null;
  const overOpen = !!over && str(over.overMarketStatus) === "OPEN" && num(over.overPrice) !== null;
  const px: Raw = overOpen && over ? { ...over, closePrice: over.overPrice } : r;
  const last = overOpen ? num(px.closePrice) : num(r.closePriceRaw ?? r.closePrice);
  if (!code || last === null) return null;
  const symbol = `${code}-KR`;
  const day = ((r.integratedPriceInfo ?? null) as Raw | null) ?? r;
  const sign = directionSign((px.compareToPreviousPrice as Raw | undefined)?.name);
  const absChange = num(px.compareToPreviousClosePriceRaw ?? px.compareToPreviousClosePrice);
  const absPct = num(px.fluctuationsRatioRaw ?? px.fluctuationsRatio);
  const change = absChange === null ? null : sign * Math.abs(absChange);
  const exchange = str((r.stockExchangeType as Raw | undefined)?.name) || "KRX";
  const status = krMarketStatus(r);
  return {
    symbol,
    name: asiaListing(symbol)?.name ?? (str(r.stockName) || code),
    type: kind,
    exchange,
    country: "KR",
    currency: "KRW",
    last,
    change,
    changePct: absPct === null ? null : sign * Math.abs(absPct),
    decimals: 0,
    isYield: false,
    open: num(day.openPriceRaw ?? day.openPrice),
    high: num(day.highPriceRaw ?? day.highPrice),
    low: num(day.lowPriceRaw ?? day.lowPrice),
    prevClose: change === null ? null : last - change,
    volume: num(day.accumulatedTradingVolumeRaw ?? day.accumulatedTradingVolume),
    // Naver stamps every reply with the time it answered, not the last trade: only a live market makes that
    // stamp a fair "as of". When closed, leave the time out rather than show a clock time the feed does not have.
    time: status === "CLOSED" ? null : isoTime(overOpen && over ? over.localTradedAt : r.localTradedAt),
    timeText: "",
    marketStatus: status,
    delayed: false,
    fundamentals: {},
    events: {},
    extended: null,
    source: "naver",
  };
}

async function fetchChunk(codes: string[]): Promise<Quote[]> {
  const [data, kinds] = await Promise.all([getJson(`${REALTIME_URL}/${codes.join(",")}`) as Promise<Raw>, fetchKinds(codes)]);
  const list = Array.isArray(data.datas) ? (data.datas as Raw[]) : [];
  return list.map((r) => toKrQuote(r, kinds.get(str(r.itemCode)))).filter((q): q is Quote => q !== null);
}

export async function fetchKrQuotes(symbols: string[]): Promise<Quote[]> {
  const codes = [...new Set(symbols.filter(isKrSymbol).map(codeOf))];
  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) chunks.push(codes.slice(i, i + QUOTE_CHUNK));
  const results = await Promise.all(chunks.map((c) => cached(`kq:${c.join(",")}`, QUOTE_TTL_MS, () => fetchChunk(c))));
  return results.flat();
}

// ---------------------------------------------------------------------------------------------------
// Charts

const NY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** New York wall-clock time of an instant, encoded as UTC seconds (the CNBC bar convention). */
export function nyWallSeconds(ms: number): number {
  const p = Object.fromEntries(NY_FMT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 1000;
}

/** "YYYYMMDDHHmm" in Korea time for a real instant (Naver's range parameters). */
function kstStamp(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().replace(/[-T:]/g, "").slice(0, 12);
}

/** Korea-time "YYYYMMDDHHmmss" -> real instant in ms. */
function kstToMs(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)) - KST_OFFSET_MS;
}

function bar(o: number | null, h: number | null, l: number | null, c: number, t: number, v: number | null): Bar {
  const open = o && o > 0 ? o : c;
  return { t, o: open, h: Math.max(h && h > 0 ? h : c, open, c), l: Math.min(l && l > 0 ? l : c, open, c), c, v: v ?? 0 };
}

/** Intraday bars from the Korean trading day (KRX + Nextrade), in NY wall-clock time. Exported for tests. */
export function intradayBars(rows: Raw[]): Bar[] {
  const out: Bar[] = [];
  for (const r of rows) {
    const dt = str(r.localDateTime);
    const hhmm = dt.slice(8, 12);
    const c = num(r.currentPrice ?? r.closePrice);
    if (dt.length < 12 || c === null || hhmm < DAY_OPEN || hhmm > DAY_CLOSE) continue;
    out.push(bar(num(r.openPrice), num(r.highPrice), num(r.lowPrice), c, nyWallSeconds(kstToMs(dt)), num(r.accumulatedTradingVolume)));
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Daily, weekly or monthly bars at 00:00 of their (Korean) date. Exported for tests. */
export function periodBars(rows: Raw[]): Bar[] {
  const out: Bar[] = [];
  for (const r of rows) {
    const d = str(r.localDate);
    const c = num(r.closePrice);
    if (d.length !== 8 || c === null) continue;
    const t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) / 1000;
    out.push(bar(num(r.openPrice), num(r.highPrice), num(r.lowPrice), c, t, num(r.accumulatedTradingVolume)));
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Which Naver series feeds each CNBC chart source, and how far back it reaches. */
const CHART_PLAN: Record<string, { series: string; days: number; intraday: boolean }> = {
  "1D": { series: "minute", days: 6, intraday: true },
  "5D": { series: "minute5", days: 12, intraday: true },
  "1Y": { series: "day", days: 2 * 366, intraday: false },
  "5Y": { series: "day", days: 6 * 366, intraday: false },
  ALL: { series: "week", days: 45 * 366, intraday: false },
};

export async function fetchKrChart(symbol: string, source: string, ttlMs: number): Promise<RawChart> {
  const plan = CHART_PLAN[source] ?? CHART_PLAN["1Y"];
  return cached(`kc:${symbol}:${source}`, ttlMs, async () => {
    const now = Date.now();
    const params = new URLSearchParams({ startDateTime: kstStamp(now - plan.days * DAY_MS), endDateTime: kstStamp(now + DAY_MS) });
    const data = await getJson(`${CHART_URL}/${codeOf(symbol)}/${plan.series}?${params}`);
    const rows = Array.isArray(data) ? (data as Raw[]) : [];
    return {
      bars: plan.intraday ? intradayBars(rows) : periodBars(rows),
      timeZone: "KST",
      utcOffset: 9,
      sessionOpen: "09:00:00",
      sessionClose: "20:00:00",
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// Search

/** Korean listings matching a query. Naver matches Korean names, codes and some romanized names. */
export async function searchKr(query: string): Promise<SearchResult[]> {
  return cached(`ks:${query.toLowerCase()}`, 300_000, async () => {
    const params = new URLSearchParams({ q: query, target: "stock" });
    const data = (await getJson(`${SEARCH_URL}?${params}`)) as Raw;
    const items = Array.isArray(data.items) ? (data.items as Raw[]) : [];
    const found = items.filter((i) => str(i.nationCode) === "KOR" && isKrSymbol(`${str(i.code)}-KR`)).slice(0, 8);
    const kinds = await fetchKinds(found.map((i) => str(i.code)));
    return found.map((i) => {
      const symbol = `${str(i.code)}-KR`;
      return { symbol, name: asiaListing(symbol)?.name ?? str(i.name), type: kinds.get(str(i.code)) ?? "STOCK", exchange: str(i.typeCode) || "KRX" };
    });
  });
}
