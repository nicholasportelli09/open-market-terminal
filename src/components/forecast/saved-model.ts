/**
 * Reader for the Valuation Lab's saved models (localStorage `terminal.valuation.v1`, written by /valuation):
 * { version: 1, models: { [SYMBOL]: { symbol, updatedAt, inputs, scenarios, result: { perShare, weighted,
 *   scenarioValues: { bear, base, bull }, priceAtSave, currency } } } }
 * The shape is validated; anything unexpected is ignored (treated as "no saved model").
 */

export const VALUATION_STORAGE_KEY = "terminal.valuation.v1";

export type SavedModel = {
  symbol: string;
  updatedAt: string;
  perShare: number | null;
  weighted: number | null;
  bear: number | null;
  base: number | null;
  bull: number | null;
  priceAtSave: number | null;
  currency: string;
};

type Raw = Record<string, unknown>;

function obj(v: unknown): Raw | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

/** A finite number, or null for null/absent. Returns undefined for anything else (invalid). */
function optNum(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** The saved model for `symbol` from the raw storage string, or null when absent or malformed. */
export function parseSavedModel(raw: string | null, symbol: string): SavedModel | null {
  if (!raw) return null;
  let root: Raw | null;
  try {
    root = obj(JSON.parse(raw));
  } catch {
    return null;
  }
  if (!root || root.version !== 1) return null;
  const models = obj(root.models);
  const key = symbol.toUpperCase();
  const m = obj(models?.[key]);
  if (!m || typeof m.symbol !== "string" || m.symbol.toUpperCase() !== key) return null;
  if (typeof m.updatedAt !== "string" || !Number.isFinite(Date.parse(m.updatedAt))) return null;
  if (!obj(m.inputs) || !Array.isArray(m.scenarios)) return null;
  const r = obj(m.result);
  const sv = obj(r?.scenarioValues);
  if (!r || !sv) return null;
  const perShare = optNum(r.perShare);
  const weighted = optNum(r.weighted);
  const bear = optNum(sv.bear);
  const base = optNum(sv.base);
  const bull = optNum(sv.bull);
  const priceAtSave = optNum(r.priceAtSave);
  const values = [perShare, weighted, bear, base, bull, priceAtSave];
  if (values.some((v) => v === undefined)) return null;
  if (typeof r.currency !== "string" || !r.currency) return null;
  if (perShare == null && weighted == null && bear == null && base == null && bull == null) return null;
  return {
    symbol: key,
    updatedAt: m.updatedAt,
    perShare: perShare ?? null,
    weighted: weighted ?? null,
    bear: bear ?? null,
    base: base ?? null,
    bull: bull ?? null,
    priceAtSave: priceAtSave ?? null,
    currency: r.currency,
  };
}

/** Read from localStorage; any storage failure counts as "no saved model". */
export function readSavedModel(symbol: string): SavedModel | null {
  try {
    return parseSavedModel(window.localStorage.getItem(VALUATION_STORAGE_KEY), symbol);
  } catch {
    return null;
  }
}
