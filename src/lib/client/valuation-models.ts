import type { DcfInputs, DcfMode, Scenario, ScenarioId } from "@/lib/valuation";

/**
 * Saved Valuation Lab models, on this device only. Written by the Valuation Lab, read by the Forecast page.
 *
 * localStorage key `terminal.valuation.v1`:
 * { version: 1, models: { [SYMBOL_UPPER]: SavedModel } }
 *
 * Readers validate every entry and silently drop bad ones; storage access never throws.
 */

export const VALUATION_STORAGE_KEY = "terminal.valuation.v1";
export const VALUATION_STORE_VERSION = 1;

export type SavedResult = {
  perShare: number | null;
  weighted: number | null;
  scenarioValues: { bear: number | null; base: number | null; bull: number | null };
  priceAtSave: number | null;
  currency: string;
};

export type SavedModel = {
  symbol: string;
  /** ISO timestamp of the save. */
  updatedAt: string;
  inputs: DcfInputs;
  scenarios: Scenario[];
  result: SavedResult;
};

export type ValuationStore = { version: 1; models: Record<string, SavedModel> };

const SYMBOL_RE = /^[A-Z0-9.@=\-^_]{1,24}$/;
const SCENARIO_IDS: readonly ScenarioId[] = ["bear", "base", "bull"];
const MODES: readonly DcfMode[] = ["fcfMargin", "fundamental"];
const SERIES_KEYS = ["revenueGrowth", "fcfMargin", "ebitMargin"] as const;
const NUMBER_KEYS = ["baseRevenue", "years", "taxRate", "salesToCapital", "wacc", "terminalGrowth", "netDebt", "sharesDiluted", "otherAdjustments"] as const;
const REQUIRED_NUMBERS = ["baseRevenue", "years", "wacc", "terminalGrowth", "netDebt", "sharesDiluted"] as const;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const isSeries = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every(isNum);

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Shape check of saved DCF inputs (types only; the engine checks the economics when it runs). */
export function isDcfInputs(v: unknown): v is DcfInputs {
  if (!isObj(v)) return false;
  if (!MODES.includes(v.mode as DcfMode)) return false;
  if (!REQUIRED_NUMBERS.every((k) => isNum(v[k]))) return false;
  if (!NUMBER_KEYS.every((k) => v[k] === undefined || isNum(v[k]))) return false;
  if (!isSeries(v.revenueGrowth)) return false;
  if (!SERIES_KEYS.every((k) => v[k] === undefined || isSeries(v[k]))) return false;
  if (v.mode === "fcfMargin" && !isSeries(v.fcfMargin)) return false;
  if (v.mode === "fundamental" && !(isSeries(v.ebitMargin) && isNum(v.taxRate) && isNum(v.salesToCapital))) return false;
  return v.midYear === undefined || typeof v.midYear === "boolean";
}

function isOverrides(v: unknown): v is Partial<DcfInputs> {
  if (!isObj(v)) return false;
  return Object.entries(v).every(([k, val]) => {
    if (val === undefined) return true;
    if ((SERIES_KEYS as readonly string[]).includes(k)) return isSeries(val);
    if ((NUMBER_KEYS as readonly string[]).includes(k)) return isNum(val);
    if (k === "mode") return MODES.includes(val as DcfMode);
    if (k === "midYear") return typeof val === "boolean";
    return false;
  });
}

export function isScenario(v: unknown): v is Scenario {
  return (
    isObj(v) &&
    SCENARIO_IDS.includes(v.id as ScenarioId) &&
    typeof v.label === "string" &&
    isNum(v.weight) &&
    v.weight >= 0 &&
    v.weight <= 1 &&
    isOverrides(v.overrides)
  );
}

function isResult(v: unknown): v is SavedResult {
  if (!isObj(v) || !isObj(v.scenarioValues)) return false;
  const s = v.scenarioValues;
  return (
    isNumOrNull(v.perShare) &&
    isNumOrNull(v.weighted) &&
    isNumOrNull(v.priceAtSave) &&
    typeof v.currency === "string" &&
    isNumOrNull(s.bear) &&
    isNumOrNull(s.base) &&
    isNumOrNull(s.bull)
  );
}

export function isSavedModel(v: unknown): v is SavedModel {
  if (!isObj(v)) return false;
  if (typeof v.symbol !== "string" || !SYMBOL_RE.test(v.symbol)) return false;
  if (typeof v.updatedAt !== "string" || !Number.isFinite(Date.parse(v.updatedAt))) return false;
  if (!Array.isArray(v.scenarios) || !v.scenarios.every(isScenario)) return false;
  const ids = v.scenarios.map((s) => s.id);
  if (new Set(ids).size !== ids.length) return false;
  return isDcfInputs(v.inputs) && isResult(v.result);
}

/** Parses the raw storage string. Bad JSON, a wrong version or bad entries give an empty / smaller store. */
export function parseStore(raw: string | null): ValuationStore {
  const empty: ValuationStore = { version: 1, models: {} };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isObj(parsed) || parsed.version !== VALUATION_STORE_VERSION || !isObj(parsed.models)) return empty;
  const models: Record<string, SavedModel> = {};
  for (const [key, model] of Object.entries(parsed.models)) {
    if (isSavedModel(model) && normalizeSymbol(model.symbol) === key) models[key] = model;
  }
  return { version: 1, models };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStore(): ValuationStore {
  try {
    return parseStore(storage()?.getItem(VALUATION_STORAGE_KEY) ?? null);
  } catch {
    return parseStore(null);
  }
}

function writeStore(store: ValuationStore): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(VALUATION_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** The saved model for a symbol, or null when there is none or it is invalid. */
export function getSavedModel(symbol: string): SavedModel | null {
  return readStore().models[normalizeSymbol(symbol)] ?? null;
}

/** Saves (replaces) one model. Returns false when the model is invalid or storage is unavailable / full. */
export function saveModel(model: SavedModel): boolean {
  const key = normalizeSymbol(model.symbol);
  const entry: SavedModel = { ...model, symbol: key };
  if (!isSavedModel(entry)) return false;
  const current = readStore();
  return writeStore({ version: 1, models: { ...current.models, [key]: entry } });
}

export function deleteModel(symbol: string): boolean {
  const key = normalizeSymbol(symbol);
  const current = readStore();
  if (!current.models[key]) return true;
  const models = Object.fromEntries(Object.entries(current.models).filter(([k]) => k !== key));
  return writeStore({ version: 1, models });
}
