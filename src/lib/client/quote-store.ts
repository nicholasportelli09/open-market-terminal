"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Quote } from "@/lib/types";

const POLL_MS = 3_000;
const HIDDEN_POLL_MS = 30_000;
const BATCH_DELAY_MS = 30;

export type FeedStatus = "connecting" | "live" | "error";

/**
 * One shared poller for every quote on screen: components subscribe to symbols,
 * the store fetches the union in a single request every few seconds.
 */
class QuoteStore {
  private refs = new Map<string, number>();
  private quotes = new Map<string, Quote>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;
  private inflight = false;
  status: FeedStatus = "connecting";
  updatedAt: number | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  get(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  retain(symbols: string[]): () => void {
    let added = false;
    for (const s of symbols) {
      const n = this.refs.get(s) ?? 0;
      this.refs.set(s, n + 1);
      if (n === 0 && !this.quotes.has(s)) added = true;
    }
    if (added || !this.timer) this.schedule(BATCH_DELAY_MS);
    return () => {
      for (const s of symbols) {
        const n = (this.refs.get(s) ?? 1) - 1;
        if (n <= 0) this.refs.delete(s);
        else this.refs.set(s, n);
      }
    };
  }

  /** Poll right away (e.g. when the tab becomes visible again). */
  refresh() {
    this.schedule(0);
  }

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private async poll() {
    const symbols = [...this.refs.keys()];
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (symbols.length === 0 || this.inflight) {
      this.schedule(POLL_MS);
      return;
    }
    this.inflight = true;
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { quotes: Quote[] };
      for (const q of data.quotes) this.quotes.set(q.symbol, q);
      this.status = "live";
      this.updatedAt = Date.now();
    } catch {
      this.status = "error";
    } finally {
      this.inflight = false;
      this.emit();
      this.schedule(hidden ? HIDDEN_POLL_MS : POLL_MS);
    }
  }
}

export const quoteStore = new QuoteStore();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") quoteStore.refresh();
  });
}

function useStoreVersion(): number {
  return useSyncExternalStore(quoteStore.subscribe, quoteStore.getVersion, () => 0);
}

export function useQuotes(symbols: string[]): Record<string, Quote | undefined> {
  const key = symbols.join(",");
  useEffect(() => quoteStore.retain(key ? key.split(",") : []), [key]);
  useStoreVersion();
  const out: Record<string, Quote | undefined> = {};
  for (const s of symbols) out[s] = quoteStore.get(s);
  return out;
}

export function useQuote(symbol: string): Quote | undefined {
  return useQuotes([symbol])[symbol];
}

export function useFeedStatus(): { status: FeedStatus; updatedAt: number | null } {
  useStoreVersion();
  return { status: quoteStore.status, updatedAt: quoteStore.updatedAt };
}
