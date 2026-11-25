import { cached } from "./cache";
import { trimFacts } from "./sec-concepts";
import type { CompanyFactsRaw } from "./sec-facts";
import { padCik } from "./sec-fundamentals";

/**
 * SEC EDGAR access under the fair-access policy: a declared User-Agent, at most 8 requests in flight
 * (SEC allows 10/s), and caching (tickers 24h, companyfacts 6h, submissions 24h).
 */

// SEC rejects a User-Agent without a contact or URL token; the default carries the policy URL.
// Operators should set SEC_USER_AGENT to "App name contact@email".
const DEFAULT_UA = "MarketTerminal/2.0 (research app; set SEC_USER_AGENT; +https://www.sec.gov/os/accessing-edgar-data)";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DATA_URL = "https://data.sec.gov";
const MAX_CONCURRENT = 8;
const TIMEOUT_MS = 15_000;
const HOUR_MS = 3_600_000;
const TICKERS_TTL_MS = 24 * HOUR_MS;
const FACTS_TTL_MS = 6 * HOUR_MS;
const SUBMISSIONS_TTL_MS = 24 * HOUR_MS;

/** Thrown for SEC transport failures. `status` is the HTTP status when there was a response. */
export class SecError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "SecError";
  }
}

export function secUserAgent(): string {
  const ua = process.env.SEC_USER_AGENT?.trim();
  return ua ? ua : DEFAULT_UA;
}

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** GET JSON from SEC. Returns null on 404 (unknown CIK), throws SecError otherwise. */
async function secJson<T>(url: string): Promise<T | null> {
  return withSlot(async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": secUserAgent(), Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new SecError(`SEC request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 404) return null;
    if (res.status === 403) throw new SecError("SEC refused the request (403). Set SEC_USER_AGENT to 'App name contact@email'.", 403);
    if (res.status === 429) throw new SecError("SEC rate limit reached (429).", 429);
    if (!res.ok) throw new SecError(`SEC responded ${res.status}`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new SecError("SEC returned malformed JSON");
    }
  });
}

export type TickerEntry = { cik: string; ticker: string; title: string };

/** SEC writes class shares with a dash (BRK-B); quotes use a dot (BRK.B). */
export function secTicker(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[./]/g, "-");
}

export function parseTickerMap(raw: unknown): Map<string, TickerEntry> {
  const map = new Map<string, TickerEntry>();
  if (!raw || typeof raw !== "object") return map;
  for (const row of Object.values(raw as Record<string, unknown>)) {
    const r = row as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    if (typeof r.ticker !== "string" || (typeof r.cik_str !== "number" && typeof r.cik_str !== "string")) continue;
    const ticker = r.ticker.toUpperCase();
    if (!map.has(ticker)) map.set(ticker, { cik: padCik(r.cik_str), ticker, title: typeof r.title === "string" ? r.title : ticker });
  }
  return map;
}

async function tickerMap(): Promise<Map<string, TickerEntry>> {
  return cached("sec:tickers", TICKERS_TTL_MS, async () => {
    const raw = await secJson<unknown>(TICKERS_URL);
    const map = parseTickerMap(raw);
    if (map.size === 0) throw new SecError("SEC ticker list was empty");
    return map;
  });
}

/** Ticker -> SEC entry (10-digit CIK), or null when SEC has no such ticker. */
export async function tickerToCik(symbol: string): Promise<TickerEntry | null> {
  const map = await tickerMap();
  return map.get(secTicker(symbol)) ?? null;
}

/** XBRL companyfacts, trimmed to the concepts the snapshot uses (see trimFacts). null = unknown CIK. */
export async function companyFacts(cik: string): Promise<CompanyFactsRaw | null> {
  const id = padCik(cik);
  return cached(`sec:facts:${id}`, FACTS_TTL_MS, async () => {
    const raw = await secJson<CompanyFactsRaw>(`${DATA_URL}/api/xbrl/companyfacts/CIK${id}.json`);
    if (!raw) return null;
    if (typeof raw !== "object" || !raw.facts) throw new SecError("SEC companyfacts had no facts");
    return trimFacts(raw);
  });
}

export type CompanyProfile = {
  cik: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  fiscalYearEnd: string | null;
  exchanges: string[];
  tickers: string[];
};

export function parseSubmissions(raw: unknown, cik: string): CompanyProfile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x))] : []);
  return {
    cik: padCik(cik),
    name: s(r.name) ?? "",
    sic: s(r.sic),
    sicDescription: s(r.sicDescription),
    fiscalYearEnd: s(r.fiscalYearEnd),
    exchanges: list(r.exchanges),
    tickers: list(r.tickers),
  };
}

/** Company profile from the submissions API (SIC, fiscal year end, exchanges). Recent filings are dropped. */
export async function companySubmissions(cik: string): Promise<CompanyProfile | null> {
  const id = padCik(cik);
  return cached(`sec:sub:${id}`, SUBMISSIONS_TTL_MS, async () => {
    const raw = await secJson<unknown>(`${DATA_URL}/submissions/CIK${id}.json`);
    return raw ? parseSubmissions(raw, id) : null;
  });
}
