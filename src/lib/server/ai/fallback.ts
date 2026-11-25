/**
 * Provider fallback: run an AI call on Gemini (free) and, if Gemini is out of quota, errors or returns unusable
 * output, run it again on Anthropic. Refusals and bad requests are not retried on another provider.
 */
import { type AiProvider, aiProviders } from "./client";
import { type AiErrorCode, isAiError, notConfiguredError } from "./errors";

const FALL_THROUGH: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>(["rate_limited", "upstream", "bad_output"]);

export async function withProviderFallback<T>(
  scope: string,
  run: (provider: AiProvider) => Promise<T>,
  opts: { signal?: AbortSignal; providers?: AiProvider[] } = {},
): Promise<T> {
  const chain = opts.providers ?? aiProviders();
  if (chain.length === 0) throw notConfiguredError();
  for (let i = 0; ; i++) {
    try {
      return await run(chain[i]);
    } catch (err) {
      const next = chain[i + 1];
      if (!next || opts.signal?.aborted || !isAiError(err) || !FALL_THROUGH.has(err.code)) throw err;
      console.warn(`[${scope}] ${chain[i]} failed (${err.code}); trying ${next}`);
    }
  }
}
