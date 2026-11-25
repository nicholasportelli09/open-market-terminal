"use client";

import { useEffect, useState } from "react";

export type FetchState<T> = { data: T | null; error: string | null; loading: boolean };

/** Fetch JSON, optionally re-polling. Keeps the last good data on refresh errors. */
export function useFetch<T>(url: string | null, intervalMs = 0): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: !!url });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    setState((s) => ({ data: s.data, error: null, loading: true }));

    const load = async () => {
      try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
        if (alive) setState({ data: body as T, error: null, loading: false });
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Request failed";
        setState((s) => ({ data: s.data, error: message, loading: false }));
      } finally {
        if (alive && intervalMs > 0) timer = setTimeout(load, intervalMs);
      }
    };
    void load();
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, intervalMs]);

  return state;
}
