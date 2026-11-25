"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalystAnswer } from "@/lib/ai/types";
import type { ApiError, ApiResult } from "@/lib/api-types";
import type { Provenance } from "@/lib/provenance";
import type { ResearchRequest } from "@/lib/server/research/types";
import { researchHistory, type HistoryEntry } from "./history";
import { authHeaders } from "@/lib/supabase/browser";
import { trackRequest } from "@/lib/client/inflight";

export type ResearchState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number; request: ResearchRequest }
  | { status: "ok"; entry: HistoryEntry; saved: boolean }
  | { status: "unavailable"; error: ApiError; request: ResearchRequest }
  | { status: "error"; error: ApiError; request: ResearchRequest };

/** POST with an abort signal. Never throws except on abort; failures come back as ApiError. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const res = await trackRequest(fetch(url, { method: "POST", body: JSON.stringify(body), signal, cache: "no-store", headers: { "Content-Type": "application/json", ...(await authHeaders()) } }));
    const json: unknown = await res.json().catch(() => null);
    if (json && typeof json === "object" && typeof (json as { ok?: unknown }).ok === "boolean") {
      const r = json as ApiResult<T>;
      if (!r.ok && r.code === "rate_limited") {
        const wait = Number(res.headers.get("Retry-After"));
        if (Number.isFinite(wait) && wait > 0) return { ...r, message: `${r.message} Try again in about ${Math.max(1, Math.ceil(wait / 60))} min.` };
      }
      return r;
    }
    return { ok: false, code: "upstream", message: `Unexpected response from the server (HTTP ${res.status}).` };
  } catch (err) {
    if (signal?.aborted) throw err;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return { ok: false, code: "upstream", message: offline ? "You appear to be offline." : "The request failed. Check your connection and try again." };
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Runs research requests, keeps the latest result, and saves successful answers to on-device history. */
export function useResearch() {
  const [state, setState] = useState<ResearchState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (request: ResearchRequest) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setState({ status: "loading", startedAt: Date.now(), request });
    let r: ApiResult<AnalystAnswer>;
    try {
      r = await postJson<AnalystAnswer>("/api/research", request, c.signal);
    } catch {
      return; // cancelled
    }
    if (controller.current !== c) return;
    if (!r.ok) {
      setState(r.code === "not_configured" ? { status: "unavailable", error: r, request } : { status: "error", error: r, request });
      return;
    }
    const entry: HistoryEntry = {
      id: newId(),
      createdAt: r.generatedAt,
      mode: request.mode,
      symbols: request.symbols,
      question: request.question,
      thesis: request.thesis,
      window: request.window,
      includedPortfolio: !!request.portfolio,
      answer: r.data,
      sources: r.sources as Provenance[],
    };
    const saved = researchHistory.add(entry);
    setState({ status: "ok", entry, saved });
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "idle" });
  }, []);

  const show = useCallback((entry: HistoryEntry) => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "ok", entry, saved: true });
  }, []);

  return { state, run, cancel, show };
}
