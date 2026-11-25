"use client";

import { useSyncExternalStore } from "react";

/** Open state of the global Analyst drawer (mounted once in the root layout). */
let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

export const analystDrawer = {
  open: () => set(true),
  close: () => set(false),
  toggle: () => set(!open),
};

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAnalystDrawerOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

/** Ticker from /q/SYMBOL (and /q/SYMBOL/forecast). */
export function symbolFromPath(pathname: string): string | null {
  const m = /^\/q\/([^/]+)/.exec(pathname);
  if (!m) return null;
  try {
    const s = decodeURIComponent(m[1]).toUpperCase();
    return /^[A-Z0-9.@=\-^_]{1,24}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}
