/**
 * Visitor AI keys ("bring your own key"). A visitor may send their own Gemini or Anthropic key with an AI request;
 * that request then runs on their key only: no sign-in needed, the owner's keys and weekly budget are not touched.
 *
 * The key arrives in request headers, lives only for that request (AsyncLocalStorage) and is never stored, cached
 * or logged. The browser keeps it in its own localStorage (src/lib/client/ai-key.ts), which is never synced.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { AiProvider } from "./client";

export const AI_KEY_HEADER = "x-ai-key";
export const AI_PROVIDER_HEADER = "x-ai-provider";

export type VisitorKey = { provider: AiProvider; key: string };

const KEY_FORMAT: Record<AiProvider, RegExp> = {
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,300}$/,
  gemini: /^[A-Za-z0-9_-]{30,100}$/,
};

const store = new AsyncLocalStorage<VisitorKey>();

/** The visitor key for the current request, or null when it runs on the server's own keys. */
export function visitorKey(): VisitorKey | null {
  return store.getStore() ?? null;
}

/** Runs `fn` with `key` as the only AI credential (or on the server's keys when `key` is null). */
export function withVisitorKey<T>(key: VisitorKey | null, fn: () => Promise<T>): Promise<T> {
  return key ? store.run(key, fn) : fn();
}

/** Reads and validates the visitor key headers. Absent headers are not an error (value null). */
export function readVisitorKey(req: Request): { ok: true; value: VisitorKey | null } | { ok: false; error: string } {
  const key = req.headers.get(AI_KEY_HEADER)?.trim() ?? "";
  const provider = req.headers.get(AI_PROVIDER_HEADER)?.trim().toLowerCase() ?? "";
  if (!key && !provider) return { ok: true, value: null };
  if (provider !== "gemini" && provider !== "anthropic") return { ok: false, error: "Choose Gemini or Anthropic for your AI key." };
  if (!KEY_FORMAT[provider].test(key)) {
    return { ok: false, error: provider === "anthropic" ? "That does not look like an Anthropic key (it starts with sk-ant-)." : "That does not look like a Gemini API key." };
  }
  return { ok: true, value: { provider, key } };
}

/**
 * Cache scope for AI answers: "owner" when the server's keys pay, else one scope per visitor key (a hash, never the
 * key). Answers are served only to requests paying the same way, so a made-up key that merely looks right (all that
 * readVisitorKey checks) never receives answers the owner or another visitor paid for.
 */
export function payerScope(): string {
  const v = visitorKey();
  return v ? `visitor-${createHash("sha256").update(`${v.provider}:${v.key}`).digest("hex").slice(0, 32)}` : "owner";
}

/** "your" for a visitor key, "this server's" otherwise (for error messages). */
export function keyOwnerLabel(): string {
  return visitorKey() ? "your" : "this server's";
}
