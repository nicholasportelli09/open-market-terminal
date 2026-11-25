"use client";

/**
 * The visitor's own AI key ("bring your own key"). Kept in this browser's localStorage only: it is not in the
 * sync key list (src/lib/sync/plan.ts), so it never reaches the account database. It is sent, in two headers,
 * only with AI requests, and the server uses it for that request alone (src/lib/server/ai/credentials.ts).
 */
import { useSyncExternalStore } from "react";

export type OwnAiProvider = "gemini" | "anthropic";
export type OwnAiKey = { provider: OwnAiProvider; key: string };

const STORAGE_KEY = "terminal.aikey.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: OwnAiKey | null } = { raw: null, value: null };

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): OwnAiKey | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OwnAiKey>;
    if ((v.provider === "gemini" || v.provider === "anthropic") && typeof v.key === "string" && v.key.length > 0) {
      return { provider: v.provider, key: v.key };
    }
  } catch {
    // Unreadable: treated as no key.
  }
  return null;
}

/** The saved key, or null. Stable between changes (safe for useSyncExternalStore). */
export function getOwnAiKey(): OwnAiKey | null {
  if (typeof window === "undefined") return null;
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function emit() {
  for (const l of listeners) l();
}

export function saveOwnAiKey(value: OwnAiKey): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: value.provider, key: value.key.trim() }));
    emit();
    return true;
  } catch {
    return false;
  }
}

export function clearOwnAiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => (e.key === null || e.key === STORAGE_KEY) && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOwnAiKey(): OwnAiKey | null {
  return useSyncExternalStore(subscribe, getOwnAiKey, () => null);
}

/** Headers that make an AI request run on the visitor's own key; empty when none is saved. */
export function ownKeyHeaders(): Record<string, string> {
  const k = getOwnAiKey();
  return k ? { "X-AI-Provider": k.provider, "X-AI-Key": k.key } : {};
}
