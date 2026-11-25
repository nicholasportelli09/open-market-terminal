/**
 * AI provider selection and the Anthropic client, from server env. Never import from client components;
 * never log a key.
 */
import Anthropic from "@anthropic-ai/sdk";
import { visitorKey } from "./credentials";

/**
 * Cheapest current model by default (Claude Haiku 5.5: $0.10 / $0.50 per million tokens, 40x below Opus 5.5).
 * Set ANTHROPIC_MODEL (e.g. claude-sonnet-5-5 or claude-opus-5-5) for deeper answers at a higher price.
 */
export const DEFAULT_MODEL = "claude-haiku-5-5";

/** Server-side refusal fallback: on a policy decline the API retries on Anthropic's recommended model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type ModelSupport = {
  /** web_search_20260209 (dynamic filtering); other models use the basic web_search_20250305. */
  dynamicWebSearch: boolean;
  /** Server-side refusal fallback (`fallbacks: "default"`); Haiku 5.5 has none. */
  serverFallback: boolean;
};

/** API features that differ by model family (per the Claude API docs, Nov 2026). */
export function modelSupport(model: string): ModelSupport {
  const dynamicWebSearch = /^claude-(fable|mythos|opus|sonnet)-/.test(model);
  const serverFallback = /^claude-(fable-5-[12]|opus-5|opus-5-5|sonnet-5-5)$/.test(model);
  return { dynamicWebSearch, serverFallback };
}

const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;

let cached: { key: string; client: Anthropic } | null = null;

/**
 * Which AI providers answer, in order. Default (AI_PROVIDER unset or "auto"): Google Gemini free tier first,
 * then Anthropic as the fallback when Gemini has no key, is out of free quota or errors. AI_PROVIDER=gemini
 * uses Gemini only (never Anthropic credits); AI_PROVIDER=anthropic uses Anthropic only. Anthropic spend is
 * capped by AI_WEEKLY_BUDGET_USD (see budget.ts).
 */
export type AiProvider = "gemini" | "anthropic";

/** Strongest Flash model on Gemini's free tier (Nov 2026). Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const KEY_ENV: Record<AiProvider, string> = { gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };

function envValue(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

function mode(): "auto" | AiProvider {
  const v = envValue("AI_PROVIDER")?.toLowerCase();
  return v === "gemini" || v === "anthropic" ? v : "auto";
}

/** Configured providers in the order they are tried. */
export function aiProviders(): AiProvider[] {
  const visitor = visitorKey();
  if (visitor) return [visitor.provider];
  const m = mode();
  const order: AiProvider[] = m === "auto" ? ["gemini", "anthropic"] : [m];
  return order.filter((p) => envValue(KEY_ENV[p]) !== null);
}

/** The provider tried first, or null when none is configured. */
export function aiProvider(): AiProvider | null {
  return aiProviders()[0] ?? null;
}

/** The env var that enables AI (shown in "not configured" states). */
export function aiKeyEnv(): string {
  return mode() === "anthropic" ? KEY_ENV.anthropic : KEY_ENV.gemini;
}

export function aiConfigured(): boolean {
  return aiProviders().length > 0;
}

export function aiModel(provider: AiProvider | null = aiProvider()): string {
  // A visitor's own key always runs the default (cheapest) model, whatever the owner configured.
  if (visitorKey()) return provider === "anthropic" ? DEFAULT_MODEL : DEFAULT_GEMINI_MODEL;
  if (provider === "anthropic") return envValue("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
  return envValue("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
}

/** Which provider served a model id (for source labels). */
export function providerOfModel(model: string): AiProvider {
  return model.startsWith("gemini") ? "gemini" : "anthropic";
}

/** Gemini key, only when Gemini is in the provider chain. */
export function geminiKey(): string | null {
  const visitor = visitorKey();
  if (visitor) return visitor.provider === "gemini" ? visitor.key : null;
  return aiProviders().includes("gemini") ? envValue(KEY_ENV.gemini) : null;
}

/**
 * Null unless Anthropic is in the provider chain (not AI_PROVIDER=gemini) and ANTHROPIC_API_KEY is set.
 * The key is passed explicitly so no other credential source is used.
 */
export function getClient(): Anthropic | null {
  const visitor = visitorKey();
  if (visitor) {
    // Never cached: the key belongs to this request only.
    return visitor.provider === "anthropic" ? new Anthropic({ apiKey: visitor.key, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS }) : null;
  }
  const key = aiProviders().includes("anthropic") ? envValue(KEY_ENV.anthropic) : null;
  if (!key) return null;
  if (cached?.key === key) return cached.client;
  const client = new Anthropic({ apiKey: key, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS });
  cached = { key, client };
  return client;
}
