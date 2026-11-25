/**
 * HTTP access to the licensed analyst providers. Server-only: keys come from config and never leave
 * this module (URLs carrying a key are never logged or returned).
 *
 * FMP stable API (https://site.financialmodelingprep.com/developer/docs/stable), key as `apikey` query param.
 * Finnhub (https://finnhub.io/docs/api/recommendation-trends), key in the X-Finnhub-Token header.
 */
import type { IssueKind } from "@/lib/analyst-types";
import { cached } from "../cache";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const FINNHUB_BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 10_000;
/** Analyst data changes a few times a day at most; long caching keeps FMP calls low (asOf shows the fetch time). */
export const ANALYST_TTL_MS = 12 * 60 * 60_000;

/** FMP's free plan allows 250 calls a day. The app stays below it with a rolling 24-hour cap (FMP_DAILY_LIMIT). */
export const FMP_PLAN_DAILY_MAX = 250;
export const DEFAULT_FMP_DAILY_LIMIT = 200;
const DAY_MS = 86_400_000;
/** An endpoint the plan does not include is not called again for this long. */
const PLAN_BLOCK_MS = DAY_MS;

export function fmpDailyLimitFromEnv(): number {
  const n = Number(process.env.FMP_DAILY_LIMIT?.trim());
  return Number.isInteger(n) && n > 0 ? Math.min(n, FMP_PLAN_DAILY_MAX) : DEFAULT_FMP_DAILY_LIMIT;
}

export type CallBudget = {
  /** Records one outgoing call, or throws ProviderError(rate_limit) when the rolling 24 hours are used up. */
  take(): void;
  used(): number;
  reset(): void;
};

/** Rolling 24-hour call counter (per server instance; FMP's own limit still applies on top). */
export function createCallBudget(provider: Provider, limit: () => number, now: () => number = Date.now): CallBudget {
  let calls: number[] = [];
  const live = () => {
    const cutoff = now() - DAY_MS;
    calls = calls.filter((t) => t > cutoff);
    return calls;
  };
  return {
    take() {
      const list = live();
      if (list.length >= limit()) {
        throw new ProviderError(provider, "rate_limit", 429, `${provider} daily call budget (${limit()}) used`);
      }
      calls = [...list, now()];
    },
    used: () => live().length,
    reset() {
      calls = [];
    },
  };
}

export const fmpBudget: CallBudget = createCallBudget("fmp", fmpDailyLimitFromEnv);
const planBlockedUntil = new Map<string, number>();

export type Provider = "fmp" | "finnhub";

export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly kind: IssueKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const NAME: Record<Provider, string> = { fmp: "FMP", finnhub: "Finnhub" };
const ENV: Record<Provider, string> = { fmp: "FMP_API_KEY", finnhub: "FINNHUB_API_KEY" };

/** Plain-language message for a provider failure, shown in the affected section. */
export function issueMessage(provider: Provider, kind: IssueKind): string {
  const name = NAME[provider];
  switch (kind) {
    case "auth":
      return `${name} rejected the API key (invalid, expired or revoked). Check ${ENV[provider]} on the server.`;
    case "plan":
      return `Your ${name} plan does not include this dataset.`;
    case "rate_limit":
      return provider === "fmp"
        ? `${name} request limit reached (this app makes at most ${fmpDailyLimitFromEnv()} FMP calls a day to stay inside the plan). Try again later.`
        : `${name} rate limit reached. Try again in a few minutes.`;
    case "not_configured":
      return `${ENV[provider]} is not set on the server.`;
    default:
      return `${name} is unavailable right now. Try again shortly.`;
  }
}

const PLAN_TEXT = /restricted endpoint|premium|subscription|upgrade your plan|not available under your current|exclusive endpoint|special endpoint/;
const AUTH_TEXT = /invalid api key|api key is invalid|invalid token|missing api key/;

/**
 * Classify a provider response. FMP answers 401 for a bad key, 402 for endpoints or symbols outside the
 * plan, 429 when the plan's limit is hit, and sometimes 200 with an { "Error Message": ... } body.
 * Finnhub answers 401 (bad key), 403 (no access on this plan) and 429.
 */
export function classifyFailure(provider: Provider, status: number, bodyText: string): IssueKind {
  const text = bodyText.toLowerCase();
  if (status === 429 || /limit reach|rate limit|too many requests/.test(text)) return "rate_limit";
  if (status === 401) return "auth";
  if (status === 402) return "plan";
  if (status === 403) return provider === "finnhub" || PLAN_TEXT.test(text) ? "plan" : "auth";
  if (PLAN_TEXT.test(text)) return "plan";
  if (AUTH_TEXT.test(text)) return "auth";
  return "upstream";
}

function errorText(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const msg = b["Error Message"] ?? b.error ?? b.message;
  return typeof msg === "string" ? msg : null;
}

async function getJson(provider: Provider, url: string, headers: Record<string, string>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const why = err instanceof Error ? err.name : "network";
    throw new ProviderError(provider, "upstream", 0, `${NAME[provider]} request failed (${why})`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const err = errorText(body);
  if (!res.ok || err) {
    const kind = classifyFailure(provider, res.status, err ?? text.slice(0, 300));
    throw new ProviderError(provider, kind, res.status, `${NAME[provider]} HTTP ${res.status}: ${kind}`);
  }
  return body;
}

export type FmpEndpoint = "price-target-consensus" | "price-target-summary" | "grades-consensus" | "grades-historical" | "grades" | "price-target-news";

/** A provider body plus when the provider produced it (the cache keeps the original time). */
export type Fetched = { body: unknown; fetchedAt: string };

async function stamped(provider: Provider, url: string, headers: Record<string, string>): Promise<Fetched> {
  const body = await getJson(provider, url, headers);
  return { body, fetchedAt: new Date().toISOString() };
}

/**
 * Loads one FMP endpoint, spending one call from the daily budget. Endpoints outside the plan are remembered for
 * a day and fail without a network call, so a free plan does not waste calls on them for every ticker.
 */
async function fmpLoad(endpoint: FmpEndpoint, url: string): Promise<Fetched> {
  const blocked = planBlockedUntil.get(endpoint);
  if (blocked && blocked > Date.now()) {
    throw new ProviderError("fmp", "plan", 402, `FMP ${endpoint}: not in plan (remembered)`);
  }
  fmpBudget.take();
  try {
    return await stamped("fmp", url, {});
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "plan") planBlockedUntil.set(endpoint, Date.now() + PLAN_BLOCK_MS);
    throw err;
  }
}

/** One FMP stable endpoint for one symbol, cached for 12 hours (failures are not cached). */
export function fmpGet(endpoint: FmpEndpoint, symbol: string, key: string, extra: Record<string, string> = {}): Promise<Fetched> {
  const params = new URLSearchParams({ symbol, ...extra });
  const cacheKey = `fmp:${endpoint}:${params.toString()}`;
  params.set("apikey", key);
  return cached(cacheKey, ANALYST_TTL_MS, () => fmpLoad(endpoint, `${FMP_BASE}/${endpoint}?${params.toString()}`));
}

/** Finnhub monthly recommendation trends for one symbol, cached for 12 hours. */
export function finnhubRecommendation(symbol: string, key: string): Promise<Fetched> {
  const params = new URLSearchParams({ symbol });
  return cached(`finnhub:recommendation:${symbol}`, ANALYST_TTL_MS, () =>
    stamped("finnhub", `${FINNHUB_BASE}/stock/recommendation?${params.toString()}`, { "X-Finnhub-Token": key }),
  );
}
