import type { Provenance } from "./provenance";

/**
 * Envelope for every V2 API route.
 * - ok: data plus the provenance of what it was built from.
 * - not_configured: the feature needs a server secret that is not set (HTTP 503). Never fake data instead.
 * - upstream: a provider failed or returned unusable data (HTTP 502).
 * - bad_request: invalid input (HTTP 400). rate_limited: HTTP 429.
 */
export type ApiOk<T> = { ok: true; data: T; sources: Provenance[]; generatedAt: string };

export type ApiErrorCode = "not_configured" | "upstream" | "bad_request" | "rate_limited" | "not_found" | "unauthorized";

export type ApiError = {
  ok: false;
  code: ApiErrorCode;
  message: string;
  /** Environment variable names the operator must set (names only, never values). */
  missingEnv?: string[];
};

export type ApiResult<T> = ApiOk<T> | ApiError;
