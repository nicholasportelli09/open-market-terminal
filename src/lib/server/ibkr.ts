/**
 * Interactive Brokers Flex Web Service client (read-only reports; it cannot trade or move money).
 *
 * Flow: SendRequest(token, queryId) -> reference code; GetStatement(token, code) -> the XML report, polled while
 * IBKR is still generating it (error 1019 and friends). The token and query id come from the user's request and
 * are used for that request only: never stored, cached or logged. Requests need a browser-like User-Agent (IBKR
 * answers 403 without one). Rate limit: 1 request per second and 10 per minute per token.
 */
import type { SearchResult } from "@/lib/types";
import {
  type FlexAccount,
  type IbkrContract,
  DIRECT_PRICE_TOLERANCE,
  type IbkrSnapshot,
  type Resolved,
  SEARCH_PRICE_TOLERANCE,
  buildSnapshot,
  candidateSymbols,
  contractKey,
  contractOf,
  parseFlexStatement,
  parseFlexStatus,
  quoteMatches,
} from "@/lib/portfolio/brokers";
import { SYMBOL_PATTERN } from "@/lib/portfolio/validate";
import { fetchQuotes } from "./cnbc";
import { searchSymbols } from "./symbol-search";

const BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const USER_AGENT = "Mozilla/5.0 (compatible; MarketTerminal/1.0; +https://github.com)";
const REQUEST_TIMEOUT_MS = 15_000;
/** Waits between GetStatement polls. */
const POLL_DELAYS_MS = [2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000];
/** IBKR calls (42 s) plus symbol lookups (RESOLVE_BUDGET_MS, 12 s) stay inside the route's 60 s limit. */
const IBKR_BUDGET_MS = 42_000;
const MIN_CALL_MS = 3_000;
const MAX_REPORT_BYTES = 8_000_000;
/** IBKR codes that mean "not ready yet, ask again". */
const RETRY_CODES = new Set([1001, 1004, 1005, 1006, 1007, 1008, 1009, 1019, 1021]);
const QUOTE_CHUNK = 40;
/** At most this many contracts fall back to a name search (each is a few upstream calls). */
const MAX_SEARCHES = 15;

export class IbkrError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "query" | "busy" | "upstream" | "format",
  ) {
    super(message);
    this.name = "IbkrError";
  }
}

const FRIENDLY: Record<number, { kind: IbkrError["kind"]; message: string }> = {
  1012: { kind: "auth", message: "Your IBKR Flex token has expired. Make a new one in IBKR (Flex Web Service) and paste it here." },
  1015: { kind: "auth", message: "IBKR does not recognise this token. Copy the whole token again from Flex Web Service." },
  1011: { kind: "auth", message: "IBKR says the account behind this token is inactive." },
  1013: { kind: "auth", message: "This token only works from one IP address. In IBKR's Flex Web Service settings, remove the IP restriction." },
  1025: { kind: "auth", message: "IBKR has locked this token after too many failed attempts. Generate a new token." },
  1014: { kind: "query", message: "IBKR does not recognise this Query ID. Use the number shown next to your Flex Query." },
  1016: { kind: "query", message: "IBKR says the account in this Flex Query is invalid." },
  1010: { kind: "query", message: "This is a legacy Flex Query. Create a new Activity Flex Query instead." },
  1020: { kind: "query", message: "IBKR could not validate the request. Check the token and Query ID." },
  1018: { kind: "busy", message: "IBKR is limiting requests for this token. Wait a minute and sync again." },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getText(path: string, params: Record<string, string>, timeoutMs: number): Promise<string> {
  const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,*/*" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new IbkrError("Could not reach IBKR. Try again shortly.", "upstream");
  }
  if (!res.ok) throw new IbkrError(`IBKR answered with an error (HTTP ${res.status}). Try again shortly.`, "upstream");
  const text = await res.text();
  if (text.length > MAX_REPORT_BYTES) throw new IbkrError("The IBKR report is too large. Use Summary level detail in the Open Positions section.", "format");
  return text;
}

function failure(code: number | null, message: string): IbkrError {
  const f = code !== null ? FRIENDLY[code] : undefined;
  return f ? new IbkrError(f.message, f.kind) : new IbkrError(`IBKR: ${message}`, code !== null && RETRY_CODES.has(code) ? "busy" : "upstream");
}

/** Runs the Flex Query and returns its accounts. Throws IbkrError with a message fit for the user. */
export async function fetchFlexAccounts(token: string, queryId: string, now: () => number = Date.now): Promise<FlexAccount[]> {
  const deadline = now() + IBKR_BUDGET_MS;
  const left = () => deadline - now();
  const busy = () => new IbkrError("IBKR is still preparing the report. Sync again in a minute.", "busy");
  const sent = parseFlexStatus(await getText("SendRequest", { t: token, q: queryId, v: "3" }, Math.min(REQUEST_TIMEOUT_MS, left())));
  if (!sent) throw new IbkrError("IBKR sent an unexpected reply. Try again shortly.", "upstream");
  if (!sent.ok) throw failure(sent.code, sent.message);
  if (!sent.referenceCode || !/^\d{1,30}$/.test(sent.referenceCode)) throw new IbkrError("IBKR did not return a report reference. Try again shortly.", "upstream");
  for (const wait of POLL_DELAYS_MS) {
    if (left() < wait + MIN_CALL_MS) throw busy();
    await sleep(wait);
    const text = await getText("GetStatement", { t: token, q: sent.referenceCode, v: "3" }, Math.min(REQUEST_TIMEOUT_MS, left()));
    const status = parseFlexStatus(text);
    if (status && !status.ok) {
      if (status.code !== null && RETRY_CODES.has(status.code)) continue;
      throw failure(status.code, status.message);
    }
    const parsed = parseFlexStatement(text);
    if (!parsed.ok) throw new IbkrError(parsed.error, "format");
    return parsed.accounts;
  }
  throw busy();
}

type QuoteRow = { symbol: string; currency: string; last: number | null; name: string };

/** Quote chunks fetched at once (CNBC handles a few parallel requests well). */
const QUOTE_CONCURRENCY = 4;
/** Symbol lookups never take longer than this; contracts not resolved in time keep stand-in symbols. */
export const RESOLVE_BUDGET_MS = 12_000;
/** The name-search fallback only runs with at least this much of the budget left. */
const MIN_SEARCH_MS = 5_000;

/** `p`, or `fallback` once `ms` have passed (the slow work is abandoned, not awaited). */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function quotesFor(symbols: string[], ms: number): Promise<Map<string, QuoteRow>> {
  const out = new Map<string, QuoteRow>();
  const unique = [...new Set(symbols)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += QUOTE_CHUNK) chunks.push(unique.slice(i, i + QUOTE_CHUNK));
  const work = (async () => {
    for (let i = 0; i < chunks.length; i += QUOTE_CONCURRENCY) {
      const batch = await Promise.all(chunks.slice(i, i + QUOTE_CONCURRENCY).map((c) => fetchQuotes(c).catch(() => [])));
      for (const q of batch.flat()) out.set(q.symbol, { symbol: q.symbol, currency: q.currency, last: q.last, name: q.name });
    }
  })();
  // Whatever arrived before the deadline is used; later chunks are dropped.
  await within(work, ms, undefined);
  return new Map(out);
}

function pick(c: IbkrContract, symbols: string[], quotes: Map<string, QuoteRow>, tolerance: number): Resolved {
  for (const s of symbols) {
    const q = quotes.get(s);
    // Only symbols the portfolio accepts (the validator would refuse the whole import otherwise).
    if (q && SYMBOL_PATTERN.test(s) && quoteMatches(c, q, tolerance)) return { symbol: s, name: q.name };
  }
  return null;
}

/**
 * App symbol for every imported contract: exchange-based guesses first, then a name search; null when none matches
 * or the lookups run out of time (RESOLVE_BUDGET_MS), so the route always answers within its time limit.
 */
export async function resolveContracts(accounts: FlexAccount[], budgetMs = RESOLVE_BUDGET_MS, now: () => number = Date.now): Promise<Map<string, Resolved>> {
  const deadline = now() + budgetMs;
  const left = () => deadline - now();
  const contracts = new Map<string, IbkrContract>();
  for (const a of accounts) for (const p of a.positions) if (!contracts.has(contractKey(p))) contracts.set(contractKey(p), contractOf(p));
  const guesses = new Map([...contracts].map(([k, c]) => [k, candidateSymbols(c)]));
  const quotes = await quotesFor([...guesses.values()].flat(), left());
  const resolved = new Map<string, Resolved>();
  const misses: [string, IbkrContract][] = [];
  for (const [k, c] of contracts) {
    const hit = pick(c, guesses.get(k) ?? [], quotes, DIRECT_PRICE_TOLERANCE);
    resolved.set(k, hit);
    if (!hit && c.assetCategory !== "OPT" && c.assetCategory !== "FUT") misses.push([k, c]);
  }
  if (misses.length === 0 || left() < MIN_SEARCH_MS) return resolved;
  const searchMs = Math.floor(left() / 2);
  const searched = await Promise.all(
    misses.slice(0, MAX_SEARCHES).map(async ([k, c]) => [k, c, await within(searchSymbols(c.symbol.replace(/\s+/g, " ")), searchMs, [] as SearchResult[])] as const),
  );
  const found = await quotesFor(searched.flatMap(([, , rs]) => rs.slice(0, 6).map((r) => r.symbol)), left());
  for (const [k, c, rs] of searched) resolved.set(k, pick(c, rs.slice(0, 6).map((r) => r.symbol), found, SEARCH_PRICE_TOLERANCE));
  return resolved;
}

/** Snapshot of the accounts with resolved symbols. */
export async function snapshotFromAccounts(accounts: FlexAccount[]): Promise<IbkrSnapshot> {
  const resolved = await resolveContracts(accounts);
  return buildSnapshot(accounts, (p) => resolved.get(contractKey(p)) ?? null, new Date().toISOString());
}
