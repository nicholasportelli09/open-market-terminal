/**
 * Builds the full screen (S&P 100 + user extras) under SEC fair access. One limiter is shared by every build
 * and by getRow on this server: at most 6 companies in flight, each making one SEC request at a time (so at
 * most 6 SEC requests in flight, under the limit of 8), and new companies started no faster than one every
 * 250 ms (about 8 SEC requests per second; SEC allows 10). Concurrent builds also share each row's build.
 * Rows are cached 6 hours; the assembled screen 6 hours (15 minutes when some rows failed, so they retry).
 */
import {
  SP100, UNIVERSE_AS_OF, UNIVERSE_NAME, UNIVERSE_SOURCE_NOTE, UNIVERSE_SOURCE_URL, UNIVERSE_VERIFIED_ON,
} from "@/lib/scanner/universe";
import type { FailedRow, ScreenData, ScreenProgress } from "@/lib/scanner/types";
import type { Quote } from "@/lib/types";
import { fetchQuotes } from "../cnbc";
import { quoteSymbol } from "../company";
import { SecError } from "../sec";
import { buildRow, RowError, type BuiltRow } from "./row";

const HOUR_MS = 3_600_000;
const ROW_TTL_MS = 6 * HOUR_MS;
const SCREEN_TTL_MS = 6 * HOUR_MS;
const PARTIAL_SCREEN_TTL_MS = 15 * 60_000;
const WORKERS = 6;
const START_GAP_MS = 250;
const RETRY_DELAY_MS = 2_000;

type Stored<T> = { at: number; value: T };
type Limiter = { active: number; waiters: (() => void)[]; nextStart: number };
type State = {
  rows: Map<string, Stored<BuiltRow>>;
  rowInflight: Map<string, Promise<BuiltRow>>;
  screens: Map<string, Stored<ScreenData> & { ttl: number }>;
  inflight: Map<string, Promise<ScreenData>>;
  /** Build progress per extras key, so each viewer sees the build for their own list. */
  progress: Map<string, ScreenProgress>;
  limiter: Limiter;
};

const IDLE: ScreenProgress = { running: false, total: 0, done: 0, failed: 0, startedAt: null };

// On globalThis so dev hot reloads and separate route bundles share one cache, one limiter and one progress map.
const g = globalThis as typeof globalThis & { __scannerStateV2?: State };
const state: State = (g.__scannerStateV2 ??= {
  rows: new Map(),
  rowInflight: new Map(),
  screens: new Map(),
  inflight: new Map(),
  progress: new Map(),
  limiter: { active: 0, waiters: [], nextStart: 0 },
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const keyOf = (extras: readonly string[]) => [...extras].sort().join(",");

/** Runs fn holding one of the server-wide SEC slots, started no sooner than START_GAP_MS after the last one. */
async function withSecSlot<T>(fn: () => Promise<T>): Promise<T> {
  const lim = state.limiter;
  if (lim.active < WORKERS) lim.active++;
  else await new Promise<void>((resolve) => lim.waiters.push(resolve)); // the releaser hands its slot over
  try {
    const wait = lim.nextStart - Date.now();
    lim.nextStart = Math.max(Date.now(), lim.nextStart) + START_GAP_MS;
    if (wait > 0) await sleep(wait);
    return await fn();
  } finally {
    const nextWaiter = lim.waiters.shift();
    if (nextWaiter) nextWaiter();
    else lim.active--;
  }
}

function freshRow(symbol: string): BuiltRow | null {
  const hit = state.rows.get(symbol);
  return hit && Date.now() - hit.at < ROW_TTL_MS ? hit.value : null;
}

function reasonOf(err: unknown): string {
  if (err instanceof RowError) return err.message;
  if (err instanceof SecError) return err.status === 429 ? "SEC rate limit reached; will retry on the next refresh." : "SEC EDGAR did not respond; will retry on the next refresh.";
  return "Data provider error; will retry on the next refresh.";
}

const retryable = (err: unknown) => err instanceof SecError && (err.status === null || err.status === 429 || err.status >= 500);

async function rowWithRetry(symbol: string, quote: Quote | null, extra: boolean): Promise<BuiltRow> {
  try {
    return await buildRow(symbol, quote, extra);
  } catch (err) {
    if (!retryable(err)) throw err;
    await sleep(RETRY_DELAY_MS);
    return buildRow(symbol, quote, extra);
  }
}

/** Builds (and caches) one row under the shared limiter; concurrent callers for the same symbol share it. */
function limitedRow(symbol: string, quote: Quote | null, extra: boolean): Promise<BuiltRow> {
  const pending = state.rowInflight.get(symbol);
  if (pending) return pending;
  const promise = withSecSlot(() => rowWithRetry(symbol, quote, extra))
    .then((row) => {
      state.rows.set(symbol, { at: Date.now(), value: row });
      return row;
    })
    .finally(() => state.rowInflight.delete(symbol));
  state.rowInflight.set(symbol, promise);
  return promise;
}

const withExtra = (b: BuiltRow, extra: boolean): BuiltRow => ({ ...b, row: { ...b.row, extra } });

async function quoteMap(symbols: string[]): Promise<Map<string, Quote>> {
  try {
    const quotes = await fetchQuotes(symbols.map(quoteSymbol));
    return new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  } catch (err) {
    console.error("[scanner] quote batch failed", err instanceof Error ? err.message : err);
    return new Map();
  }
}

async function compute(extras: string[], key: string): Promise<ScreenData> {
  const started = Date.now();
  const symbols = [...SP100, ...extras];
  const extraSet = new Set(extras);
  const bump = (failedNow: boolean) => {
    const p = state.progress.get(key) ?? IDLE;
    state.progress.set(key, { ...p, done: p.done + 1, failed: p.failed + (failedNow ? 1 : 0) });
  };
  state.progress.set(key, { running: true, total: symbols.length, done: 0, failed: 0, startedAt: new Date(started).toISOString() });
  const quotes = await quoteMap(symbols);
  const built = new Map<string, BuiltRow>();
  const failed: FailedRow[] = [];
  let next = 0;

  // The workers only feed the shared limiter; it alone decides how many SEC-bound builds run at once.
  const worker = async () => {
    while (next < symbols.length) {
      const symbol = symbols[next++];
      const extra = extraSet.has(symbol);
      try {
        const row = freshRow(symbol) ?? (await limitedRow(symbol, quotes.get(quoteSymbol(symbol)) ?? null, extra));
        built.set(symbol, withExtra(row, extra));
        bump(false);
      } catch (err) {
        if (!(err instanceof RowError)) console.error("[scanner] row failed", symbol, err instanceof Error ? err.message : err);
        failed.push({ symbol, reason: reasonOf(err), extra });
        bump(true);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: WORKERS }, worker));
  } finally {
    const p = state.progress.get(key) ?? IDLE;
    state.progress.set(key, { ...p, running: false });
  }
  return {
    universe: { name: UNIVERSE_NAME, asOf: UNIVERSE_AS_OF, verifiedOn: UNIVERSE_VERIFIED_ON, note: UNIVERSE_SOURCE_NOTE, url: UNIVERSE_SOURCE_URL, count: SP100.length },
    rows: symbols.flatMap((s) => {
      const b = built.get(s);
      return b ? [b.row] : [];
    }),
    failed: failed.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    extras,
    computedAt: new Date().toISOString(),
    computeMs: Date.now() - started,
    cached: false,
  };
}

/** The screen for these (already validated) extras: cached, or computed once with concurrent callers sharing it. */
export async function getScreen(extras: string[]): Promise<ScreenData> {
  const key = keyOf(extras);
  const hit = state.screens.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return { ...hit.value, cached: true };
  const pending = state.inflight.get(key);
  if (pending) return pending;
  const promise = compute(extras, key)
    .then((data) => {
      state.screens.set(key, { at: Date.now(), value: data, ttl: data.failed.length ? PARTIAL_SCREEN_TTL_MS : SCREEN_TTL_MS });
      return data;
    })
    .finally(() => state.inflight.delete(key));
  state.inflight.set(key, promise);
  return promise;
}

/** Progress of the build for this (already validated) extras list; idle when none has run on this instance. */
export function screenProgress(extras: string[]): ScreenProgress {
  return state.progress.get(keyOf(extras)) ?? IDLE;
}

/** One company's row + full snapshot: from the row cache when fresh, else built now. */
export async function getRow(symbol: string): Promise<BuiltRow> {
  const hit = freshRow(symbol);
  if (hit) return hit;
  const [quote] = await fetchQuotes([quoteSymbol(symbol)]).catch(() => [] as Quote[]);
  const extra = !SP100.includes(symbol);
  return withExtra(await limitedRow(symbol, quote ?? null, extra), extra);
}
