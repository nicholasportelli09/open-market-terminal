/**
 * AI spend ledger: estimates the dollar cost of every AI response from its usage and refuses new
 * calls once the rolling 7-day estimate reaches AI_WEEKLY_BUDGET_USD (default $1).
 *
 * In memory, so the ledger is per server instance and restarts empty after a cold start. The hard guarantee is
 * the monthly spend limit set in the Anthropic Console; this cap keeps normal use far below it.
 */
import { AiError } from "./errors";

/** USD per million tokens (Anthropic list prices, Nov 2026). */
type Price = { input: number; output: number };

const PRICES: ReadonlyArray<readonly [RegExp, Price]> = [
  // Gemini free tier: no charge while the Google project has no billing account linked.
  [/^gemini-/, { input: 0, output: 0 }],
  [/^claude-haiku-5-5/, { input: 0.1, output: 0.5 }],
  [/^claude-haiku-4-5/, { input: 1, output: 5 }],
  [/^claude-sonnet-5/, { input: 2, output: 10 }],
  [/^claude-sonnet-/, { input: 3, output: 15 }],
  [/^claude-opus-5-5/, { input: 4, output: 20 }],
  [/^claude-opus-/, { input: 5, output: 25 }],
];
/** Unknown models are priced at the most expensive tier so the cap errs on the safe side. */
const UNKNOWN_PRICE: Price = { input: 10, output: 50 };
/** Haiku 5.5 charges 5x for prompts over 100K tokens. */
const HAIKU_LONG_PROMPT_TOKENS = 100_000;
const HAIKU_LONG_PROMPT_FACTOR = 5;
export const WEB_SEARCH_USD = 0.01;
const CACHE_WRITE_FACTOR = 1.25;
const CACHE_READ_FACTOR = 0.1;

export const DEFAULT_WEEKLY_BUDGET_USD = 1;
const WEEK_MS = 7 * 86_400_000;
const MAX_ENTRIES = 10_000;

export type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

function priceOf(model: string): Price {
  return PRICES.find(([re]) => re.test(model))?.[1] ?? UNKNOWN_PRICE;
}

/** Estimated USD for one response (tokens + web searches). */
export function estimateCostUsd(model: string, usage: UsageLike): number {
  const p = priceOf(model);
  const input = usage.input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const prompt = input + written + read;
  const factor = model.startsWith("claude-haiku-5-5") && prompt > HAIKU_LONG_PROMPT_TOKENS ? HAIKU_LONG_PROMPT_FACTOR : 1;
  const inputUsd = ((input + written * CACHE_WRITE_FACTOR + read * CACHE_READ_FACTOR) * p.input * factor) / 1e6;
  const outputUsd = ((usage.output_tokens ?? 0) * p.output * factor) / 1e6;
  const searchUsd = (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
  return inputUsd + outputUsd + searchUsd;
}

export function weeklyBudgetFromEnv(): number {
  const n = Number(process.env.AI_WEEKLY_BUDGET_USD?.trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WEEKLY_BUDGET_USD;
}

export type Ledger = {
  /** Throws AiError rate_limited when the rolling week's estimate has reached the budget. */
  assertAvailable(): void;
  record(model: string, usage: UsageLike): number;
  /** Rolling 7-day estimate in USD. */
  spent(): number;
  reset(): void;
};

export function createLedger(budget: () => number, now: () => number = Date.now): Ledger {
  let entries: { at: number; usd: number }[] = [];
  const live = () => {
    const cutoff = now() - WEEK_MS;
    entries = entries.filter((e) => e.at > cutoff);
    return entries;
  };
  const spent = () => live().reduce((s, e) => s + e.usd, 0);
  return {
    assertAvailable() {
      const total = spent();
      const cap = budget();
      if (total < cap) return;
      const oldest = entries[0]?.at ?? now();
      const retryAfterSec = Math.max(60, Math.ceil((oldest + WEEK_MS - now()) / 1000));
      throw new AiError(
        "rate_limited",
        `This week's AI budget ($${cap.toFixed(2)}, estimated from token use) is used up on this server. It frees up as older use rolls off; the owner can raise AI_WEEKLY_BUDGET_USD.`,
        { retryAfterSec },
      );
    },
    record(model, usage) {
      const usd = estimateCostUsd(model, usage);
      const list = live();
      entries = list.length >= MAX_ENTRIES ? [...list.slice(1), { at: now(), usd }] : [...list, { at: now(), usd }];
      return usd;
    },
    spent,
    reset() {
      entries = [];
    },
  };
}

/** Shared ledger for every AI call on this instance. */
export const aiLedger: Ledger = createLedger(weeklyBudgetFromEnv);
