/**
 * Pure helpers that read provider rating vocabulary. Brokers use their own words ("Overweight",
 * "Sector Perform", "Top Pick"); these map them onto the five buckets used across the app.
 */
import { RATING_KEYS, type RatingAction, type RatingCounts, type RatingKey } from "@/lib/analyst-types";

const STRONG_BUY = /\b(strong[\s-]?buy|top pick|conviction buy|strong outperform)\b/;
const STRONG_SELL = /\b(strong[\s-]?sell)\b/;
const SELL = /\b(sell|underperform|underweight|reduce|negative|sector underperform|market underperform|below average|cautious)\b/;
const HOLD = /\b(hold|neutral|equal[\s-]?weight|market perform|sector perform|peer perform|in[\s-]?line|perform|mixed|fair value|sector weight|market weight)\b/;
const BUY = /\b(buy|outperform|overweight|accumulate|add|positive|market outperform|sector outperform|long-term buy|speculative buy|moderate buy)\b/;

/** Bucket for a broker's rating text; null when the text is empty or unknown. */
export function ratingKeyOf(grade: string | null | undefined): RatingKey | null {
  const g = (grade ?? "").trim().toLowerCase();
  if (!g) return null;
  if (STRONG_BUY.test(g)) return "strongBuy";
  if (STRONG_SELL.test(g)) return "strongSell";
  // Check sell-side words before "perform" (so "Underperform" is not read as hold).
  if (SELL.test(g)) return "sell";
  if (BUY.test(g)) return "buy";
  if (HOLD.test(g)) return "hold";
  return null;
}

const SCORE: Record<RatingKey, number> = { strongBuy: 5, buy: 4, hold: 3, sell: 2, strongSell: 1 };

/** Order of a bucket for comparisons (higher = more bullish). */
export function ratingScore(key: RatingKey | null): number | null {
  return key ? SCORE[key] : null;
}

/**
 * The FMP grades `action` field ("maintain", "upgrade", "downgrade", "init", "reiterate"...). Unknown or
 * empty values fall back to comparing the old and new rating buckets.
 */
export function actionOf(action: string | null | undefined, oldGrade: string | null, newGrade: string | null): RatingAction {
  const a = (action ?? "").trim().toLowerCase();
  if (/upgrad|^up$/.test(a)) return "upgrade";
  if (/downgrad|^down$/.test(a)) return "downgrade";
  if (/^init|initiat|coverage/.test(a)) return "initiate";
  if (/reiterat/.test(a)) return "reiterate";
  if (/maintain|hold|main/.test(a)) return "maintain";
  const before = ratingScore(ratingKeyOf(oldGrade));
  const after = ratingScore(ratingKeyOf(newGrade));
  if (!oldGrade && newGrade) return "initiate";
  if (before != null && after != null) return after > before ? "upgrade" : after < before ? "downgrade" : "maintain";
  return "other";
}

export function emptyCounts(): RatingCounts {
  return { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
}

export function countTotal(c: RatingCounts): number {
  return RATING_KEYS.reduce((sum, k) => sum + c[k], 0);
}

/**
 * Consensus bucket from counts, by the average score (Strong Buy 5 ... Strong Sell 1), rounded to the
 * nearest bucket. Only used when a provider gives counts without a consensus label (Finnhub).
 */
export function consensusFromCounts(c: RatingCounts): RatingKey | null {
  const total = countTotal(c);
  if (total === 0) return null;
  const avg = RATING_KEYS.reduce((s, k) => s + SCORE[k] * c[k], 0) / total;
  if (avg >= 4.5) return "strongBuy";
  if (avg >= 3.5) return "buy";
  if (avg >= 2.5) return "hold";
  if (avg >= 1.5) return "sell";
  return "strongSell";
}

/** "Apple price target lowered to $252 from $275 at Morgan Stanley" -> 275. */
export function previousTargetFromTitle(title: string | null | undefined): number | null {
  const m = (title ?? "").match(/\bfrom\s+\$?\s?([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Firm names differ slightly between FMP endpoints ("D.A. Davidson" vs "DA Davidson"). */
export function firmKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(securities|capital markets|capital|research|group|llc|inc|co|partners|& co)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
