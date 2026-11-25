import { capmCostOfEquity, wacc as waccFormula } from "@/lib/valuation";
import type { LabState } from "./lab-model";
import type { LabSeed } from "./seed";

/** Default pre-tax cost of debt = risk-free + this spread; shown as "your assumption". */
export const DEFAULT_DEBT_SPREAD = 0.015;

/**
 * Market inputs for the WACC builder. `equity` is the sourced market value of equity (see sourcedEquity);
 * when it is left out the snapshot's market cap is used.
 */
export type MarketInputs = { riskFree: number | null; beta: number | null; equity?: number | null };

export type EquitySeed = { value: number | null; derived: boolean };

/**
 * Market value of equity for the WACC weights: the user's share count x the live price when the share count is
 * overridden, else the snapshot market cap, else the seeded share count x the live price.
 */
export function sourcedEquity(state: LabState, seed: LabSeed, price: number | null): EquitySeed {
  const own = state.overrides.sharesDiluted;
  if (own !== undefined && price !== null) return { value: own * price, derived: true };
  if (seed.marketCap.value !== null) return { value: seed.marketCap.value, derived: false };
  const shares = seed.sharesDiluted.value;
  return shares !== null && price !== null ? { value: shares * price, derived: true } : { value: null, derived: false };
}

export type WaccBreakdown = {
  value: number | null;
  source: "direct" | "builder";
  riskFree: number | null;
  beta: number | null;
  costOfEquity: number | null;
  costOfDebt: number | null;
  taxRate: number | null;
  equityValue: number | null;
  debtValue: number | null;
  equityWeight: number | null;
  debtWeight: number | null;
  missing: string[];
};

export function computeWacc(state: LabState, seed: LabSeed, market: MarketInputs): WaccBreakdown {
  const w = state.wacc;
  const riskFree = w.riskFree ?? market.riskFree;
  const beta = w.beta ?? market.beta;
  const costOfDebt = w.costOfDebt ?? (riskFree === null ? null : riskFree + DEFAULT_DEBT_SPREAD);
  const taxRate = state.overrides.taxRate ?? seed.taxRate.value;
  const e = w.equityValue ?? (market.equity !== undefined ? market.equity : seed.marketCap.value);
  const d = w.debtValue ?? seed.totalDebt.value;
  const total = e !== null && d !== null ? e + d : null;
  const costOfEquity = riskFree !== null && beta !== null ? capmCostOfEquity(riskFree, beta, w.erp) : null;
  const missing = [
    riskFree === null && "risk-free rate",
    beta === null && "beta",
    e === null && "market value of equity",
    d === null && "debt",
    taxRate === null && "tax rate",
  ].filter((x): x is string => !!x);
  const built =
    costOfEquity !== null && costOfDebt !== null && e !== null && d !== null && taxRate !== null
      ? waccFormula({ equityValue: e, debtValue: d, costOfEquity, preTaxCostOfDebt: costOfDebt, taxRate })
      : null;
  return {
    value: w.useDirect ? w.direct : built,
    source: w.useDirect ? "direct" : "builder",
    riskFree,
    beta,
    costOfEquity,
    costOfDebt,
    taxRate,
    equityValue: e,
    debtValue: d,
    equityWeight: total && total > 0 && e !== null ? e / total : null,
    debtWeight: total && total > 0 && d !== null ? d / total : null,
    missing: w.useDirect ? (w.direct === null ? ["WACC"] : []) : missing,
  };
}
