/**
 * Research history on this device: localStorage "terminal.research.v1". Capped by entry count and size;
 * bad entries are ignored. Every storage access is wrapped in try/catch.
 */
import { useSyncExternalStore } from "react";
import type { AnalystAnswer } from "@/lib/ai/types";
import type { Provenance } from "@/lib/provenance";
import { RESEARCH_MODES, type MoveWindow, type ResearchMode } from "@/lib/server/research/types";

export const HISTORY_KEY = "terminal.research.v1";
export const MAX_HISTORY = 20;
export const MAX_HISTORY_CHARS = 600_000;

export type HistoryEntry = {
  id: string;
  createdAt: string;
  mode: ResearchMode;
  symbols: string[];
  question: string;
  thesis?: string;
  window?: MoveWindow;
  includedPortfolio: boolean;
  answer: AnalystAnswer;
  sources: Provenance[];
};

type Stored = { version: 1; entries: HistoryEntry[] };

function isEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  const a = e.answer as Record<string, unknown> | undefined;
  return (
    typeof e.id === "string" &&
    typeof e.createdAt === "string" &&
    typeof e.mode === "string" &&
    (RESEARCH_MODES as readonly string[]).includes(e.mode) &&
    Array.isArray(e.symbols) &&
    typeof e.question === "string" &&
    Array.isArray(e.sources) &&
    !!a &&
    Array.isArray(a.sections) &&
    Array.isArray(a.citations) &&
    Array.isArray(a.warnings)
  );
}

/** Parses stored JSON, keeping only valid entries (newest first). */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as Partial<Stored>;
    if (data?.version !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries.filter(isEntry).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

/** Adds an entry at the front and drops the oldest until the list fits the count and size caps. */
export function withEntry(entries: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  let next = [entry, ...entries.filter((e) => e.id !== entry.id)].slice(0, MAX_HISTORY);
  while (next.length > 1 && JSON.stringify({ version: 1, entries: next }).length > MAX_HISTORY_CHARS) next = next.slice(0, -1);
  return next;
}

const EMPTY: HistoryEntry[] = [];
let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): HistoryEntry[] {
  if (cache) return cache;
  try {
    cache = parseHistory(localStorage.getItem(HISTORY_KEY));
  } catch {
    cache = [];
  }
  return cache;
}

function write(entries: HistoryEntry[]): boolean {
  cache = entries;
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, entries } satisfies Stored));
    return true;
  } catch {
    return false;
  }
}

export const researchHistory = {
  add: (entry: HistoryEntry) => write(withEntry(read(), entry)),
  remove: (id: string) => write(read().filter((e) => e.id !== id)),
  clear: () => write([]),
};

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== HISTORY_KEY) return;
    cache = null;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useResearchHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
