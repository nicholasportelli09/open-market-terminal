/**
 * Small valuation formulas. Every function returns null (never NaN or Infinity) when its inputs make the
 * result undefined; the doc comment of each says when.
 */

const finite = (...xs: unknown[]): boolean => xs.every((x) => typeof x === "number" && Number.isFinite(x));

/** fair / price - 1 (0.25 = fair value 25 % above price). Null when price <= 0 or any input non-finite. */
export function upside(fair: number, price: number): number | null {
  if (!finite(fair, price) || price <= 0) return null;
  return fair / price - 1;
}

/**
 * 1 - price / fair: the discount of price to fair value (0.2 = price 20 % below fair value).
 * Negative when price > fair. Null when fair <= 0 (no margin of safety exists) or any input non-finite.
 */
export function marginOfSafety(fair: number, price: number): number | null {
  if (!finite(fair, price) || fair <= 0) return null;
  return 1 - price / fair;
}

/** CAPM: rf + beta * erp. Null when any input is non-finite. */
export function capmCostOfEquity(riskFree: number, beta: number, equityRiskPremium: number): number | null {
  if (!finite(riskFree, beta, equityRiskPremium)) return null;
  return riskFree + beta * equityRiskPremium;
}

export type WaccInputs = {
  /** Market value of equity. */
  equityValue: number;
  /** Market (or book, if that is all you have) value of debt. */
  debtValue: number;
  costOfEquity: number;
  preTaxCostOfDebt: number;
  taxRate: number;
};

/**
 * E/(D+E) * Ke + D/(D+E) * Kd * (1 - t). Null when a value is non-finite, E or D is negative, D + E is 0,
 * or taxRate is outside [0, 1].
 */
export function wacc(i: WaccInputs): number | null {
  const { equityValue: e, debtValue: d, costOfEquity, preTaxCostOfDebt, taxRate } = i;
  if (!finite(e, d, costOfEquity, preTaxCostOfDebt, taxRate)) return null;
  if (e < 0 || d < 0 || e + d <= 0 || taxRate < 0 || taxRate > 1) return null;
  const total = e + d;
  return (e / total) * costOfEquity + (d / total) * preTaxCostOfDebt * (1 - taxRate);
}

/** (end / start)^(1 / years) - 1. Null when start <= 0, end < 0, years <= 0 or any input non-finite. */
export function cagr(start: number, end: number, years: number): number | null {
  if (!finite(start, end, years) || start <= 0 || end < 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}
