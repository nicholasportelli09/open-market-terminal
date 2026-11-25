/**
 * Analyst consensus, price targets, rating distribution and rating history, as returned by
 * GET /api/analyst?symbol=. Licensed providers only: Financial Modeling Prep (primary) and Finnhub
 * (monthly recommendation trends). Every section is optional and carries its own provenance.
 */
import type { Provenance } from "./provenance";

export const RATING_KEYS = ["strongBuy", "buy", "hold", "sell", "strongSell"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export type RatingCounts = Record<RatingKey, number>;

export const RATING_LABEL: Record<RatingKey, string> = {
  strongBuy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
  strongSell: "Strong Sell",
};

export type AnalystConsensus = {
  /** Consensus label as the provider gives it (FMP grades-consensus), or derived from counts for Finnhub. */
  rating: string;
  ratingKey: RatingKey | null;
  counts: RatingCounts;
  /** Number of ratings behind the consensus. */
  total: number;
  /** True when this app derived the label from the counts (Finnhub has no consensus label). */
  derived: boolean;
  provenance: Provenance;
};

export type TargetCounts = { lastMonth: number | null; lastQuarter: number | null; lastYear: number | null; allTime: number | null };

export type AnalystTargets = {
  low: number | null;
  average: number | null;
  median: number | null;
  high: number | null;
  /** How many price targets FMP saw in each window (price-target-summary), when available. */
  counts: TargetCounts | null;
  /** Average target over the last year (price-target-summary), when available. */
  lastYearAverage: number | null;
  provenance: Provenance;
};

export type DistributionMonth = { period: string; counts: RatingCounts; total: number };

export type AnalystDistribution = {
  current: RatingCounts | null;
  currentTotal: number;
  /** Monthly snapshots, oldest first. */
  trend: DistributionMonth[];
  provenance: Provenance;
  trendProvenance: Provenance | null;
};

export type RatingAction = "upgrade" | "downgrade" | "maintain" | "initiate" | "reiterate" | "target" | "other";

export const ACTION_LABEL: Record<RatingAction, string> = {
  upgrade: "Upgrades",
  downgrade: "Downgrades",
  maintain: "Maintains",
  initiate: "Initiates",
  reiterate: "Reiterates",
  target: "Price target",
  other: "Other",
};

export type AnalystRatingRow = {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  firm: string;
  analyst: string | null;
  action: RatingAction;
  ratingOld: string | null;
  ratingNew: string | null;
  ratingKey: RatingKey | null;
  targetOld: number | null;
  targetNew: number | null;
  /** Stock price when the note was published (FMP price-target-news). */
  priceWhenPosted: number | null;
  url: string | null;
  publisher: string | null;
};

export type AnalystHistory = { rows: AnalystRatingRow[]; provenance: Provenance };

export type AnalystSection = "consensus" | "targets" | "distribution" | "history";

export type IssueKind = "auth" | "plan" | "rate_limit" | "upstream" | "not_configured";

/** Why a section (or part of it) is missing. Shown in that section instead of numbers. */
export type AnalystIssue = { section: AnalystSection; provider: "fmp" | "finnhub"; kind: IssueKind; message: string; env?: string };

export type AnalystData = {
  symbol: string;
  consensus?: AnalystConsensus;
  targets?: AnalystTargets;
  distribution?: AnalystDistribution;
  history?: AnalystHistory;
  issues: AnalystIssue[];
  /** Which providers had a key on the server (names only, never values). */
  configured: { fmp: boolean; finnhub: boolean };
};

/** Percent change from `price` to `target`: 10 means the target is 10 % above the price. */
export function impliedUpside(target: number | null | undefined, price: number | null | undefined): number | null {
  if (target == null || price == null || !Number.isFinite(target) || !Number.isFinite(price) || price <= 0) return null;
  return (target / price - 1) * 100;
}
