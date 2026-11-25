import { runDcf } from "./dcf";
import { upside } from "./metrics";
import type { DcfInputs, DcfResult, Invalid } from "./types";
import { isFiniteNumber } from "./validate";

export type ScenarioId = "bear" | "base" | "bull";

/**
 * A user-defined case. `weight` is the user's own probability for the case (0 to 1), never a model
 * confidence. Overrides replace base inputs key by key; keys set to undefined are ignored.
 */
export type Scenario = { id: ScenarioId; label: string; overrides: Partial<DcfInputs>; weight: number };

export type ScenarioRun = {
  id: ScenarioId;
  label: string;
  weight: number;
  result: DcfResult;
  /** null when this scenario's inputs are invalid (see result.errors). */
  perShare: number | null;
  /** perShare / price - 1; null without a valid price or perShare. */
  upside: number | null;
};

export type WeightedValue =
  | { ok: true; value: number; upside: number | null }
  | { ok: false; message: string };

export type ScenariosResult = { ok: true; scenarios: ScenarioRun[]; weighted: WeightedValue } | Invalid;

export const WEIGHT_TOLERANCE = 1e-9;

function applyOverrides(base: DcfInputs, overrides: Partial<DcfInputs>): DcfInputs {
  const defined = Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined));
  return { ...base, ...defined };
}

function checkScenarios(scenarios: Scenario[], price: number | null): string[] {
  const errors: string[] = [];
  if (price !== null && (!isFiniteNumber(price) || price <= 0)) errors.push("price must be a finite number greater than 0, or null when unavailable.");
  if (!Array.isArray(scenarios) || scenarios.length === 0) return [...errors, "At least one scenario is needed."];
  const ids = scenarios.map((s) => s.id);
  if (new Set(ids).size !== ids.length) errors.push("Scenario ids must be unique.");
  scenarios.forEach((s) => {
    if (!isFiniteNumber(s.weight) || s.weight < 0 || s.weight > 1) errors.push(`Weight for ${s.id} must be between 0 and 1 (got ${s.weight}).`);
  });
  return errors;
}

function weightedValue(runs: ScenarioRun[], price: number | null): WeightedValue {
  const total = runs.reduce((s, r) => s + r.weight, 0);
  if (Math.abs(total - 1) > WEIGHT_TOLERANCE) {
    return { ok: false, message: `Your scenario weights add up to ${Number(total.toFixed(6))}, not 1; adjust them to see a weighted value.` };
  }
  const failed = runs.filter((r) => r.perShare === null).map((r) => r.id);
  if (failed.length) return { ok: false, message: `No weighted value: invalid inputs in ${failed.join(", ")}.` };
  const value = runs.reduce((s, r) => s + r.weight * (r.perShare as number), 0);
  return { ok: true, value, upside: price === null ? null : upside(value, price) };
}

/**
 * Runs each scenario as base inputs plus its overrides. Per-scenario results are always returned (invalid
 * scenarios carry their errors). The probability-weighted value is given only when the user's weights sum
 * to 1 (within 1e-9) and every scenario is valid. `price` may be null when no live price is available.
 */
export function runScenarios(base: DcfInputs, scenarios: Scenario[], price: number | null): ScenariosResult {
  const errors = checkScenarios(scenarios, price);
  if (errors.length) return { ok: false, errors };

  const runs: ScenarioRun[] = scenarios.map((s) => {
    const result = runDcf(applyOverrides(base, s.overrides));
    const perShare = result.ok ? result.perShare : null;
    return {
      id: s.id,
      label: s.label,
      weight: s.weight,
      result,
      perShare,
      upside: perShare === null || price === null ? null : upside(perShare, price),
    };
  });
  return { ok: true, scenarios: runs, weighted: weightedValue(runs, price) };
}
