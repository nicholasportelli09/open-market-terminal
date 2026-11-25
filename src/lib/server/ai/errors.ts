/**
 * Typed AI errors and their mapping to the V2 ApiResult envelope.
 * Built on NextResponse directly (does not depend on src/lib/server/api.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ApiError, ApiErrorCode } from "@/lib/api-types";
import { aiKeyEnv } from "./client";
import { keyOwnerLabel } from "./credentials";

export type AiErrorCode = "not_configured" | "rate_limited" | "refused" | "upstream" | "bad_output" | "bad_request";

export class AiError extends Error {
  readonly code: AiErrorCode;
  /** Seconds the caller should wait (rate_limited only). */
  readonly retryAfterSec?: number;

  constructor(code: AiErrorCode, message: string, opts: { retryAfterSec?: number; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AiError";
    this.code = code;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export function isAiError(err: unknown): err is AiError {
  return err instanceof AiError;
}

function retryAfterFrom(headers: Headers | undefined): number | undefined {
  const raw = headers?.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined;
}

/** Map anything thrown by the SDK (or our code) to an AiError. Logs server-side detail without secrets. */
export function toAiError(err: unknown, scope = "ai"): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("rate_limited", "The AI provider is rate limiting requests. Try again shortly.", {
      retryAfterSec: retryAfterFrom(err.headers) ?? 60,
      cause: err,
    });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error(`[${scope}] AI credentials rejected (status ${err.status})`);
    return new AiError("upstream", `The AI provider rejected ${keyOwnerLabel()} key.`, { cause: err });
  }
  if (err instanceof Anthropic.APIUserAbortError) {
    return new AiError("upstream", "The AI request was cancelled.", { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    console.error(`[${scope}] AI connection failed: ${err.message}`);
    return new AiError("upstream", "Could not reach the AI provider. Try again shortly.", { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    // 400s are our bug (request shape); 5xx/529 are provider trouble. Either way the user sees a 502.
    console.error(`[${scope}] AI API error ${err.status}: ${err.message}`);
    return new AiError("upstream", "The AI provider returned an error. Try again shortly.", { cause: err });
  }
  console.error(`[${scope}] AI failure:`, err instanceof Error ? err.message : err);
  return new AiError("upstream", "The AI request failed.", { cause: err });
}

const ENVELOPE: Record<AiErrorCode, { status: number; code: ApiErrorCode }> = {
  not_configured: { status: 503, code: "not_configured" },
  rate_limited: { status: 429, code: "rate_limited" },
  bad_request: { status: 400, code: "bad_request" },
  // ApiErrorCode has no "refused"; the message says what happened. 422: the request was understood but declined.
  refused: { status: 422, code: "upstream" },
  bad_output: { status: 502, code: "upstream" },
  upstream: { status: 502, code: "upstream" },
};

/** ApiError envelope + HTTP status for any thrown value. */
export function aiErrorToResponse(err: unknown, scope = "ai"): NextResponse<ApiError> {
  const e = toAiError(err, scope);
  const { status, code } = ENVELOPE[e.code];
  const body: ApiError = { ok: false, code, message: e.message };
  if (e.code === "not_configured") body.missingEnv = [aiKeyEnv()];
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (e.code === "rate_limited" && e.retryAfterSec !== undefined) headers["Retry-After"] = String(e.retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

export function notConfiguredError(): AiError {
  return new AiError("not_configured", `AI features need ${aiKeyEnv()} on the server.`);
}
