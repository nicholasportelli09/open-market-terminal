/**
 * On-device storage for the scanner (per viewer, this browser only):
 * - terminal.scanner.v1: { version: 1, extras: string[], weights: Weights }
 * - terminal.theses.v1:  { version: 1, theses: ThesisResult[] } (newest first)
 * Every access is wrapped in try/catch; bad or foreign shapes are ignored, never trusted.
 */
import { DEFAULT_WEIGHTS, type Weights } from "./factors";
import { sanitizeWeights } from "./scoring";
import type { ThesisResult } from "./thesis";
import { cleanExtras } from "./universe";

export const SCANNER_KEY = "terminal.scanner.v1";
export const THESES_KEY = "terminal.theses.v1";
export const MAX_SAVED_THESES = 25;

export type ScannerPrefs = { extras: string[]; weights: Weights };

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function parsePrefs(raw: unknown): ScannerPrefs {
  const r = (raw ?? {}) as { version?: unknown; extras?: unknown; weights?: unknown };
  if (r.version !== 1) return { extras: [], weights: DEFAULT_WEIGHTS };
  const extras = Array.isArray(r.extras) ? cleanExtras(r.extras.filter((x): x is string => typeof x === "string")) : [];
  return { extras, weights: sanitizeWeights(r.weights, DEFAULT_WEIGHTS) };
}

export const loadPrefs = (): ScannerPrefs => parsePrefs(read(SCANNER_KEY));
export const savePrefs = (p: ScannerPrefs): boolean => write(SCANNER_KEY, { version: 1, ...p });

function isThesis(v: unknown): v is ThesisResult {
  const t = v as Partial<ThesisResult> | null;
  return (
    !!t && typeof t.symbol === "string" && typeof t.name === "string" && typeof t.generatedAt === "string" &&
    !!t.answer && Array.isArray(t.answer.sections) && Array.isArray(t.answer.citations) &&
    (t.scenarios === null || Array.isArray(t.scenarios)) && Array.isArray(t.warnings)
  );
}

export function parseTheses(raw: unknown): ThesisResult[] {
  const r = (raw ?? {}) as { version?: unknown; theses?: unknown };
  if (r.version !== 1 || !Array.isArray(r.theses)) return [];
  return r.theses.filter(isThesis).slice(0, MAX_SAVED_THESES);
}

export const loadTheses = (): ThesisResult[] => parseTheses(read(THESES_KEY));

/** Adds (newest first, one per symbol + timestamp) and returns the new list; null when storage failed. */
export function saveThesis(list: readonly ThesisResult[], t: ThesisResult): ThesisResult[] | null {
  const next = [t, ...list.filter((x) => !(x.symbol === t.symbol && x.generatedAt === t.generatedAt))].slice(0, MAX_SAVED_THESES);
  return write(THESES_KEY, { version: 1, theses: next }) ? next : null;
}

export function deleteThesis(list: readonly ThesisResult[], t: ThesisResult): ThesisResult[] | null {
  const next = list.filter((x) => !(x.symbol === t.symbol && x.generatedAt === t.generatedAt));
  return write(THESES_KEY, { version: 1, theses: next }) ? next : null;
}
