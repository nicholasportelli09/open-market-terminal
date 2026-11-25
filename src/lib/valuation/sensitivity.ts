import { dcfPerShare } from "./dcf";
import type { DcfInputs, Invalid } from "./types";
import { isFiniteNumber, validateDcfInputs } from "./validate";

export type SensitivityAxes = { waccValues: number[]; growthValues: number[] };

export type SensitivityGrid = {
  ok: true;
  waccValues: number[];
  growthValues: number[];
  /** values[i][j] = per-share value at waccValues[i] and growthValues[j] (terminal growth); null where wacc <= g or invalid. */
  values: (number | null)[][];
};

export type SensitivityResult = SensitivityGrid | Invalid;

/** A known-valid wacc / g pair used only to check the other inputs independently of the grid axes. */
const PROBE_RATES = { wacc: 0.5, terminalGrowth: 0 } as const;
const AXIS_DECIMALS = 12;
/** centeredRange returns [] above this many steps per side (at most 2 * 50 + 1 = 101 values). */
export const MAX_STEPS_PER_SIDE = 50;
/** sensitivityGrid rejects longer axes so a grid never runs more than 101 * 101 DCFs. */
export const MAX_AXIS_LENGTH = 2 * MAX_STEPS_PER_SIDE + 1;

/**
 * Per-share value for every (WACC, terminal growth) pair. The other inputs come from `inputs`; the base
 * wacc / terminalGrowth are replaced by each grid pair. Cells where wacc <= g (or the pair is otherwise
 * invalid) are null, never NaN. Invalid non-rate inputs or empty / non-finite axes return { ok: false }.
 */
export function sensitivityGrid(inputs: DcfInputs, axes: SensitivityAxes): SensitivityResult {
  const errors: string[] = [];
  const base = validateDcfInputs({ ...inputs, ...PROBE_RATES });
  if (!base.ok) errors.push(...base.errors);
  const { waccValues, growthValues } = axes;
  if (!Array.isArray(waccValues) || waccValues.length === 0) errors.push("waccValues needs at least one value.");
  else if (waccValues.length > MAX_AXIS_LENGTH) errors.push(`waccValues can have at most ${MAX_AXIS_LENGTH} values.`);
  else if (!waccValues.every(isFiniteNumber)) errors.push("waccValues must all be finite numbers.");
  if (!Array.isArray(growthValues) || growthValues.length === 0) errors.push("growthValues needs at least one value.");
  else if (growthValues.length > MAX_AXIS_LENGTH) errors.push(`growthValues can have at most ${MAX_AXIS_LENGTH} values.`);
  else if (!growthValues.every(isFiniteNumber)) errors.push("growthValues must all be finite numbers.");
  if (errors.length) return { ok: false, errors };

  const values = waccValues.map((wacc) =>
    growthValues.map((terminalGrowth) => (wacc <= terminalGrowth ? null : dcfPerShare({ ...inputs, wacc, terminalGrowth }))),
  );
  return { ok: true, waccValues: [...waccValues], growthValues: [...growthValues], values };
}

/**
 * Evenly spaced values centred on `center`: center - halfWidth ... center + halfWidth in `step`s, e.g.
 * centeredRange(0.09, 0.02, 0.005) = [0.07, 0.075, ..., 0.09, ..., 0.11] (9 values). The centre is exactly
 * `center`; other values are rounded to 12 decimals to drop float noise. halfWidth is rounded to a whole
 * number of steps. Returns [] when any argument is non-finite, step <= 0, halfWidth < 0 or the range would need
 * more than MAX_STEPS_PER_SIDE steps per side.
 */
export function centeredRange(center: number, halfWidth: number, step: number): number[] {
  if (![center, halfWidth, step].every(isFiniteNumber) || step <= 0 || halfWidth < 0) return [];
  const n = Math.round(halfWidth / step);
  if (!(n <= MAX_STEPS_PER_SIDE)) return [];
  return Array.from({ length: 2 * n + 1 }, (_, k) => {
    const i = k - n;
    return i === 0 ? center : Number((center + i * step).toFixed(AXIS_DECIMALS));
  });
}
