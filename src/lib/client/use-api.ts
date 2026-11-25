"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError, ApiResult } from "@/lib/api-types";
import type { Provenance } from "@/lib/provenance";
import { authHeaders } from "@/lib/supabase/browser";
import { trackRequest } from "./inflight";

export type ApiStatus = "idle" | "loading" | "ok" | "unavailable" | "error";

export type ApiState<T> = {
  /**
   * idle: no url. loading: first load in flight. ok: data present. unavailable: the server is not
   * configured for this feature (503 not_configured). error: anything else failed.
   * A refresh that fails after a success keeps status "ok" with the last good data and sets `error`.
   */
  status: ApiStatus;
  data: T | null;
  sources: Provenance[];
  generatedAt: string | null;
  error: ApiError | null;
  /** True when `data` is from an earlier successful load and the latest refresh failed. */
  stale: boolean;
  reload: () => void;
};

export type ApiOptions = { intervalMs?: number; method?: "GET" | "POST"; body?: unknown };

function networkError(err: unknown): ApiError {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const detail = err instanceof Error && err.message ? `: ${err.message}` : ".";
  return { ok: false, code: "upstream", message: offline ? "You appear to be offline." : `Request failed${detail}` };
}

function isApiResult(v: unknown): v is ApiResult<unknown> {
  return !!v && typeof v === "object" && typeof (v as { ok?: unknown }).ok === "boolean";
}

async function request<T>(
  url: string,
  method: string,
  body: string | undefined,
  signal?: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult<T>> {
  if (method === "GET" && body !== undefined) {
    return { ok: false, code: "bad_request", message: "Usage error: a GET request cannot send a body; use method POST." };
  }
  try {
    const res = await fetch(url, {
      method,
      body,
      signal,
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json", ...extraHeaders } : extraHeaders,
    });
    const json: unknown = await res.json().catch(() => null);
    if (isApiResult(json)) return json as ApiResult<T>;
    return { ok: false, code: "upstream", message: `Unexpected response (HTTP ${res.status}).` };
  } catch (err) {
    if (signal?.aborted) throw err;
    return networkError(err);
  }
}

/** Imperative call to a V2 route. Never throws; failures come back as ApiError. */
export async function postApi<T>(url: string, body: unknown, opts: { auth?: boolean } = {}): Promise<ApiResult<T>> {
  if (!opts.auth) return request<T>(url, "POST", JSON.stringify(body ?? {}));
  return trackRequest(request<T>(url, "POST", JSON.stringify(body ?? {}), undefined, await authHeaders()));
}

/** State plus the request it belongs to, so a new url never shows the previous url's data. */
type Inner<T> = Omit<ApiState<T>, "reload"> & { key: string };

const IDLE: Inner<never> = { key: "", status: "idle", data: null, sources: [], generatedAt: null, error: null, stale: false };

/** Typed hook over the ApiResult envelope, optionally polling every `intervalMs`. */
export function useApi<T>(url: string | null, opts: ApiOptions = {}): ApiState<T> {
  const { intervalMs = 0, method = "GET" } = opts;
  const bodyKey = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const [state, setState] = useState<Inner<T>>(IDLE);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) {
      setState(IDLE);
      return;
    }
    const key = `${method} ${url} ${bodyKey ?? ""}`;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    setState((s) => (s.key === key && s.data !== null ? s : { ...IDLE, key, status: "loading" }));

    const load = async () => {
      try {
        const r = await request<T>(url, method, bodyKey, controller.signal);
        if (!alive) return;
        if (r.ok) {
          setState({ key, status: "ok", data: r.data, sources: r.sources, generatedAt: r.generatedAt, error: null, stale: false });
        } else {
          setState((s) =>
            s.key === key && s.data !== null
              ? { ...s, error: r, stale: true }
              : { ...IDLE, key, status: r.code === "not_configured" ? "unavailable" : "error", error: r },
          );
        }
      } catch {
        return; // aborted by cleanup
      }
      if (alive && intervalMs > 0) timer = setTimeout(load, intervalMs);
    };
    void load();
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, method, bodyKey, intervalMs, nonce]);

  // Between a url change and its effect, report loading rather than the previous url's data.
  const current = url ? `${method} ${url} ${bodyKey ?? ""}` : "";
  const s: Inner<T> = !url ? IDLE : state.key === current ? state : { ...IDLE, key: current, status: "loading" };
  return { status: s.status, data: s.data, sources: s.sources, generatedAt: s.generatedAt, error: s.error, stale: s.stale, reload };
}
