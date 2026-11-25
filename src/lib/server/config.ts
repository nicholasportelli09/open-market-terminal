/**
 * Server-only configuration. Secrets are read from process.env at call time (so tests and hot
 * reloads see changes) and never sent to the client: expose only booleans via providerStatus().
 * Never import this module from a "use client" file (read() throws in the browser).
 */

import { aiProviders } from "./ai/client";

export const ENV_NAMES = {
  anthropicKey: "ANTHROPIC_API_KEY",
  anthropicModel: "ANTHROPIC_MODEL",
  geminiKey: "GEMINI_API_KEY",
  geminiModel: "GEMINI_MODEL",
  aiProvider: "AI_PROVIDER",
  fmpKey: "FMP_API_KEY",
  finnhubKey: "FINNHUB_API_KEY",
  secUserAgent: "SEC_USER_AGENT",
  aiDailyLimit: "AI_DAILY_LIMIT",
} as const;

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_SEC_USER_AGENT = "MarketTerminal/2.0 (research app; set SEC_USER_AGENT)";
export const DEFAULT_AI_DAILY_LIMIT = 25;

function read(name: string): string | null {
  if (typeof window !== "undefined") throw new Error("Server configuration read in the browser");
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export const env = {
  anthropicApiKey: (): string | null => read(ENV_NAMES.anthropicKey),
  anthropicModel: (): string => read(ENV_NAMES.anthropicModel) ?? DEFAULT_ANTHROPIC_MODEL,
  geminiApiKey: (): string | null => read(ENV_NAMES.geminiKey),
  fmpApiKey: (): string | null => read(ENV_NAMES.fmpKey),
  finnhubApiKey: (): string | null => read(ENV_NAMES.finnhubKey),
  /** SEC asks for "App name contact-email"; falls back to a generic agent. */
  secUserAgent: (): string => read(ENV_NAMES.secUserAgent) ?? DEFAULT_SEC_USER_AGENT,
  /** Global cap on AI calls per server instance per day; invalid values fall back to the default. */
  aiDailyLimit: (): number => {
    const n = Number(read(ENV_NAMES.aiDailyLimit));
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_AI_DAILY_LIMIT;
  },
};

/**
 * `ai` is true when any provider in the chain has its key. Default chain: Gemini (free) then Anthropic (fallback);
 * AI_PROVIDER=gemini or AI_PROVIDER=anthropic restricts it to one.
 */
export type ProviderStatus = {
  ai: boolean;
  /** Provider tried first, or null when none is configured. */
  aiProvider: "gemini" | "anthropic" | null;
  /** Provider used when the first is out of quota or fails, if any. */
  aiFallback: "anthropic" | null;
  anthropic: boolean;
  gemini: boolean;
  fmp: boolean;
  finnhub: boolean;
  secUserAgentSet: boolean;
};

export function providerStatus(): ProviderStatus {
  const chain = aiProviders();
  return {
    ai: chain.length > 0,
    aiProvider: chain[0] ?? null,
    aiFallback: chain[1] === "anthropic" ? "anthropic" : null,
    anthropic: env.anthropicApiKey() !== null,
    gemini: env.geminiApiKey() !== null,
    fmp: env.fmpApiKey() !== null,
    finnhub: env.finnhubApiKey() !== null,
    secUserAgentSet: read(ENV_NAMES.secUserAgent) !== null,
  };
}
