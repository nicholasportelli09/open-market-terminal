import { dcfPerShare } from "./dcf";
import { solveMonotonic, type SolveFailure } from "./solve";
import type { DcfInputs } from "./types";
import { validateDcfInputs } from "./validate";

/** Search range for the implied constant revenue growth. */
export const GROWTH_RANGE = { lo: -0.5, hi: 1.0 } as const;
/** Search range for the implied constant margin (FCF or EBIT). */
export const MARGIN_RANGE = { lo: -1, hi: 1 } as const;
/** Search range for the implied WACC; the low end is lifted above terminalGrowth. */
export const WACC_RANGE = { lo: 0.001, hi: 0.5 } as const;
const WACC_GAP = 1e-4;

/** Optional search range override, e.g. to pick one of several roots the default range reports. */
export type SearchRange = { lo: number; hi: number };

export type ImpliedSuccess<K extends string> = { ok: true; monotonic: boolean; iterations: number } & Record<K, number>;
export type ImpliedResult<K extends string> = ImpliedSuccess<K> | SolveFailure;

function precheck(inputs: DcfInputs, targetPrice: number, range?: SearchRange): SolveFailure | null {
  if (range && !(Number.isFinite(range.lo) && Number.isFinite(range.hi) && range.lo < range.hi)) {
    return { ok: false, reason: "invalid inputs", message: "Search range must be two finite numbers with lo < hi." };
  }
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    return { ok: false, reason: "invalid target", message: "Target price must be a finite number greater than 0." };
  }
  const v = validateDcfInputs(inputs);
  if (!v.ok) return { ok: false, reason: "invalid inputs", message: "The DCF inputs are invalid.", errors: v.errors };
  return null;
}

function wrap<K extends string>(key: K, result: ReturnType<typeof solveMonotonic>): ImpliedResult<K> {
  if (!result.ok) return result;
  return { ok: true, monotonic: result.monotonic, iterations: result.iterations, [key]: result.value } as ImpliedSuccess<K>;
}

/**
 * The one constant annual revenue growth (applied to every forecast year) that makes the DCF per-share value
 * equal targetPrice, holding margins and every other input fixed. Bisection on [-0.5, 1.0].
 * `monotonic: false` means per-share value is not monotonic in growth on the sampled grid; the single root
 * found is still exact.
 *
 * In fundamental mode value rises with growth when incremental ROIC (ebitMargin * (1 - taxRate) *
 * salesToCapital) exceeds WACC and falls with growth when it is below. If a curve is ever non-monotonic, two
 * roots come back as "multiple solutions in range" with both `roots`; pass a narrower `range` to pick one.
 */
export function impliedGrowth(inputs: DcfInputs, targetPrice: number, range: SearchRange = GROWTH_RANGE): ImpliedResult<"growth"> {
  const bad = precheck(inputs, targetPrice, range);
  if (bad) return bad;
  const fn = (g: number) => dcfPerShare({ ...inputs, revenueGrowth: [g] });
  return wrap("growth", solveMonotonic(fn, targetPrice, range.lo, range.hi));
}

/**
 * The one constant margin that makes the DCF per-share value equal targetPrice, holding growth fixed:
 * the FCF margin in fcfMargin mode, the EBIT margin in fundamental mode. Bisection on [-1, 1].
 */
export function impliedMargin(inputs: DcfInputs, targetPrice: number, range: SearchRange = MARGIN_RANGE): ImpliedResult<"margin"> {
  const bad = precheck(inputs, targetPrice, range);
  if (bad) return bad;
  const fn = (m: number) =>
    dcfPerShare(inputs.mode === "fcfMargin" ? { ...inputs, fcfMargin: [m] } : { ...inputs, ebitMargin: [m] });
  return wrap("margin", solveMonotonic(fn, targetPrice, range.lo, range.hi));
}

/**
 * The discount rate (WACC) the market price implies, holding cash flows fixed. Searched on
 * [max(range.lo, terminalGrowth + 0.0001), range.hi], default range [0.001, 0.5].
 */
export function impliedWacc(inputs: DcfInputs, targetPrice: number, range: SearchRange = WACC_RANGE): ImpliedResult<"wacc"> {
  const bad = precheck(inputs, targetPrice, range);
  if (bad) return bad;
  const lo = Math.max(range.lo, inputs.terminalGrowth + WACC_GAP);
  if (lo >= range.hi) {
    return { ok: false, reason: "no solution in range", message: "terminalGrowth leaves no room for a WACC in the search range." };
  }
  const fn = (w: number) => dcfPerShare({ ...inputs, wacc: w });
  return wrap("wacc", solveMonotonic(fn, targetPrice, lo, range.hi));
}
