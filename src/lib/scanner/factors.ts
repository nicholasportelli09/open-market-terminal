/**
 * Factor definitions for the scanner: which metrics feed each factor, which direction is better, and which
 * companies a metric applies to. Pure data; scoring.ts does the maths.
 */
import type { ScanMetricKey } from "./types";

export const FACTOR_IDS = ["value", "quality", "growth", "catalysts", "risk"] as const;
export type FactorId = (typeof FACTOR_IDS)[number];

/** "all" = every company; "financial" = banks and insurers (SIC 6000-6499) only; "nonfinancial" = the rest. */
export type Applies = "all" | "financial" | "nonfinancial";

export type FactorMetric = { key: ScanMetricKey; better: "high" | "low"; applies: Applies };

export type FactorDef = { id: FactorId; label: string; short: string; summary: string; metrics: readonly FactorMetric[] };

/** Minimum metrics a company needs for a factor score; fewer gives no score (never imputed). */
export const MIN_METRICS_PER_FACTOR = 2;
/** Minimum factor scores a company needs for a composite. */
export const MIN_FACTORS_FOR_COMPOSITE = 3;

export const FACTORS: readonly FactorDef[] = [
  {
    id: "value",
    label: "Value",
    short: "Val",
    summary: "Cheaper on cash flow and earnings scores higher: high FCF yield, low EV/EBIT, low P/E. Banks and insurers: low P/E and low price-to-book.",
    metrics: [
      { key: "fcfYield", better: "high", applies: "nonfinancial" },
      { key: "evToEbit", better: "low", applies: "nonfinancial" },
      { key: "pe", better: "low", applies: "all" },
      { key: "priceToBook", better: "low", applies: "financial" },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    short: "Qual",
    summary: "Higher returns and margins and lower leverage score higher: ROIC (ROE for banks and insurers), operating and FCF margin, low debt/equity, high interest coverage.",
    metrics: [
      { key: "roic", better: "high", applies: "nonfinancial" },
      { key: "roe", better: "high", applies: "financial" },
      { key: "operatingMarginTTM", better: "high", applies: "all" },
      { key: "fcfMarginTTM", better: "high", applies: "all" },
      { key: "debtToEquity", better: "low", applies: "nonfinancial" },
      { key: "interestCoverage", better: "high", applies: "nonfinancial" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    short: "Grw",
    summary: "Faster revenue growth scores higher: TTM revenue growth and 3-year revenue CAGR.",
    metrics: [
      { key: "revenueGrowthTTM", better: "high", applies: "all" },
      { key: "revenueCagr3y", better: "high", applies: "all" },
    ],
  },
  {
    id: "catalysts",
    label: "Catalysts",
    short: "Cat",
    summary: "Near-term dated events score higher: next earnings within 30 days (yes ranks above no) and more 8-K filings in the last 30 days. A mechanical count, not a judgement of whether the events are good or bad.",
    metrics: [
      { key: "earningsWithin30d", better: "high", applies: "all" },
      { key: "filings8k30d", better: "high", applies: "all" },
    ],
  },
  {
    id: "risk",
    label: "Risk",
    short: "Risk",
    summary: "Lower risk scores higher: low 1-year volatility, small 1-year max drawdown, low beta, low debt/equity.",
    metrics: [
      { key: "volatility1y", better: "low", applies: "all" },
      { key: "maxDrawdown1y", better: "low", applies: "all" },
      { key: "beta", better: "low", applies: "all" },
      { key: "debtToEquity", better: "low", applies: "nonfinancial" },
    ],
  },
];

export type Weights = Record<FactorId, number>;

export const DEFAULT_WEIGHTS: Weights = { value: 20, quality: 20, growth: 20, catalysts: 20, risk: 20 };
export const MAX_WEIGHT = 100;

export function appliesTo(applies: Applies, financial: boolean): boolean {
  return applies === "all" || (applies === "financial") === financial;
}
