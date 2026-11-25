"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_WATCHLIST } from "@/lib/instruments";

const KEY = "terminal.watchlist.v1";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cache = Array.isArray(parsed) && parsed.every((s) => typeof s === "string") ? parsed : DEFAULT_WATCHLIST;
  } catch {
    cache = DEFAULT_WATCHLIST;
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep in memory only */
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, read, () => DEFAULT_WATCHLIST);
  const toggle = useCallback((symbol: string) => {
    const cur = read();
    write(cur.includes(symbol) ? cur.filter((s) => s !== symbol) : [...cur, symbol]);
  }, []);
  const remove = useCallback((symbol: string) => write(read().filter((s) => s !== symbol)), []);
  return { list, toggle, remove, has: (s: string) => list.includes(s) };
}
