/**
 * Client-safe types for the opportunity scanner (/api/scanner). Fractions are plain ratios (0.25 = 25%).
 */
import type { Metric, MetricKey, MetricUnit } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";

/** Snapshot metrics the scanner carries to the client (scoring inputs plus the DCF base). */
export const SNAPSHOT_KEYS = [
  "marketCap", "sharesOutstanding", "revenueTTM", "fcfTTM", "netDebt", "enterpriseValue", "equity",
  "fcfYield", "evToEbit", "pe", "roic", "roe", "grossMarginTTM", "operatingMarginTTM", "netMarginTTM",
  "fcfMarginTTM", "debtToEquity", "interestCoverage", "revenueGrowthTTM", "revenueCagr3y",
] as const satisfies readonly MetricKey[];

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[number];

/** Metrics the scanner derives itself (risk inputs, catalysts, price-to-book). */
export const DERIVED_KEYS = ["priceToBook", "volatility1y", "maxDrawdown1y", "return1y", "beta", "earningsWithin30d", "filings8k30d"] as const;

export type DerivedKey = (typeof DERIVED_KEYS)[number];

export type ScanMetricKey = SnapshotKey | DerivedKey;

export type ScanUnit = MetricUnit | "count" | "flag";

/** A sourced figure. Same contract as the company snapshot Metric, with two extra units. */
export type ScanMetric = Omit<Metric, "unit"> & { unit: ScanUnit };

export type CatalystKind = "earnings" | "ex_dividend" | "filing_8k";

export type Catalyst = {
  kind: CatalystKind;
  /** YYYY-MM-DD. */
  date: string;
  label: string;
  /** Plain-language detail, e.g. 8-K item descriptions or "after the close". */
  detail?: string;
  /** True when the provider marks the date as an estimate. */
  estimated?: boolean;
  /** True when the date is in the future (relative to the screen time). */
  upcoming: boolean;
  provenance: Provenance;
};

export type ScreenRow = {
  symbol: string;
  name: string;
  cik: string;
  /** Broad sector derived from the SEC SIC code (see sectors.ts); "Unclassified" when SIC is missing. */
  sector: string;
  sic: string | null;
  sicDescription: string | null;
  financialCompany: boolean;
  /** Currency of the SEC figures. */
  currency: string;
  currencyMismatch: boolean;
  /** CNBC price at screen time, with session and as-of. */
  price: Metric;
  metrics: Record<ScanMetricKey, ScanMetric>;
  catalysts: Catalyst[];
  ttmPeriodEnd: string | null;
  warnings: string[];
  /** True when the row was added by the user (not in the index). */
  extra: boolean;
};

export type FailedRow = { symbol: string; reason: string; extra: boolean };

export type ScreenData = {
  universe: { name: string; asOf: string; verifiedOn: string; note: string; url: string; count: number };
  rows: ScreenRow[];
  failed: FailedRow[];
  extras: string[];
  /** When the screen was computed (rows are cached server-side for up to 6 hours). */
  computedAt: string;
  computeMs: number;
  /** True when this response came from the in-memory cache. */
  cached: boolean;
};

export type ScreenProgress = {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  startedAt: string | null;
};
