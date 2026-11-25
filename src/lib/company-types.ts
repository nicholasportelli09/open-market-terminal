import type { Provenance } from "./provenance";

/**
 * Client-safe types for the normalized company snapshot (/api/company).
 * Fractions (margins, growth, yields, returns) are plain ratios: 0.25 means 25%.
 */

/** How a metric's value should be formatted. money/per_share are in `CompanySnapshot.currency`. */
export type MetricUnit = "money" | "per_share" | "shares" | "fraction" | "multiple";

export type Metric = {
  /** null when the inputs are missing, stale, non-positive where that matters, or in mixed currencies. */
  value: number | null;
  provenance: Provenance;
  /** How the value was computed, e.g. "Revenue TTM = sum of last 4 quarters". */
  formula: string;
  unit: MetricUnit;
  /** Why the value is null (only set when value is null). */
  reason?: string;
};

export type AnnualPoint = {
  fiscalYear: number;
  /** Period end, YYYY-MM-DD. */
  periodEnd: string;
  value: number;
  provenance: Provenance;
};

export const METRIC_KEYS = [
  "sharesOutstanding",
  "marketCap",
  "cash",
  "totalDebt",
  "netDebt",
  "enterpriseValue",
  "equity",
  "revenueTTM",
  "grossProfitTTM",
  "operatingIncomeTTM",
  "netIncomeTTM",
  "epsDilutedTTM",
  "operatingCashFlowTTM",
  "capexTTM",
  "fcfTTM",
  "ebitdaTTM",
  "revenueGrowthTTM",
  "revenueCagr3y",
  "grossMarginTTM",
  "operatingMarginTTM",
  "netMarginTTM",
  "fcfMarginTTM",
  "pe",
  "evToSales",
  "evToEbit",
  "evToEbitda",
  "priceToFcf",
  "fcfYield",
  "roe",
  "roic",
  "debtToEquity",
  "interestCoverage",
  "effectiveTaxRate",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type CompanySnapshot = {
  /** Symbol as quoted by CNBC (class shares use a dot, e.g. BRK.B). */
  symbol: string;
  /** Ten-digit zero-padded SEC CIK. */
  cik: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  /** Fiscal year end as MMDD from SEC submissions, e.g. "0926". */
  fiscalYearEnd: string | null;
  exchanges: string[];
  /** Currency of the SEC fundamentals (from the XBRL units), e.g. "USD" or "EUR". */
  currency: string;
  /** Currency of the CNBC quote; null when there was no quote. */
  quoteCurrency: string | null;
  /** True when quote and fundamentals use different currencies: price-based metrics are then null. */
  currencyMismatch: boolean;
  /** Banks and insurers (SIC 6000-6499): debt-based and EV metrics are not meaningful and are null. */
  financialCompany: boolean;
  price: Metric;
  metrics: Record<MetricKey, Metric>;
  /** Annual revenue from 10-K / 20-F filings, oldest first, up to 10 fiscal years. */
  revenueHistory: AnnualPoint[];
  /** Period end of the trailing-twelve-month figures, YYYY-MM-DD. */
  ttmPeriodEnd: string | null;
  /** Balance sheet date used for cash, debt and equity, YYYY-MM-DD. */
  balanceSheetDate: string | null;
  /** Plain-language caveats (stale share count, currency mismatch, derived quarters...). */
  warnings: string[];
};

/** Result of companySnapshot(): unsupported filers are a normal outcome, not an error. */
export type CompanySnapshotResult =
  | { kind: "ok"; snapshot: CompanySnapshot }
  | { kind: "not_found"; message: string }
  | { kind: "unsupported"; message: string; cik: string; name: string };
