/**
 * Response helpers for V2 API routes. Every response uses the ApiResult envelope from
 * src/lib/api-types.ts. Errors are never cached; successes may be cached at the edge.
 */
import { NextResponse } from "next/server";
import type { ApiError, ApiErrorCode, ApiOk } from "@/lib/api-types";
import type { Provenance } from "@/lib/provenance";

const NO_STORE = "no-store";

function cacheControl(maxAgeSec: number): string {
  if (maxAgeSec <= 0) return NO_STORE;
  return `public, s-maxage=${Math.round(maxAgeSec)}, stale-while-revalidate=${Math.round(maxAgeSec * 5)}`;
}

/** 200 with data and the provenance of what it was built from. */
export function ok<T>(data: T, sources: Provenance[], maxAgeSec = 0): NextResponse<ApiOk<T>> {
  const body: ApiOk<T> = { ok: true, data, sources, generatedAt: new Date().toISOString() };
  return NextResponse.json(body, { headers: { "Cache-Control": cacheControl(maxAgeSec) } });
}

function fail(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: Partial<ApiError> = {},
  headers: Record<string, string> = {},
): NextResponse<ApiError> {
  const body: ApiError = { ok: false, code, message, ...extra };
  return NextResponse.json(body, { status, headers: { "Cache-Control": NO_STORE, ...headers } });
}

/** 503: the feature needs server env vars that are not set. Lists the names (never values). */
export function notConfigured(message: string, envs: string[]): NextResponse<ApiError> {
  return fail(503, "not_configured", message, { missingEnv: envs });
}

/**
 * 502: a provider failed. Logs the detail server-side and returns a generic message so
 * upstream errors (URLs, keys in query strings) never reach the client.
 */
export function upstream(scope: string, err: unknown, message = "A data provider is unavailable. Try again shortly."): NextResponse<ApiError> {
  console.error(`[${scope}]`, err instanceof Error ? err.message : err);
  return fail(502, "upstream", message);
}

export function badRequest(message: string): NextResponse<ApiError> {
  return fail(400, "bad_request", message);
}

/** 429, with Retry-After when known. */
export function rateLimited(message: string, retryAfterSec?: number): NextResponse<ApiError> {
  const headers: Record<string, string> = retryAfterSec ? { "Retry-After": String(Math.ceil(retryAfterSec)) } : {};
  return fail(429, "rate_limited", message, {}, headers);
}

export function notFound(message: string): NextResponse<ApiError> {
  return fail(404, "not_found", message);
}

/** 401: sign-in required or the sign-in is not accepted. */
export function unauthorized(message: string): NextResponse<ApiError> {
  return fail(401, "unauthorized", message);
}
