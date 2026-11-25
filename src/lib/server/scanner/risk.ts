/**
 * Pure risk inputs from daily closes: annualised volatility, max drawdown and 1-year return over the last
 * 365 calendar days, plus the CNBC-reported beta. No network.
 */
import type { Bar } from "@/lib/types";
import type { Provenance } from "@/lib/provenance";
import type { ScanMetric } from "@/lib/scanner/types";

const DAY_SEC = 86_400;
const WINDOW_DAYS = 365;
const TRADING_DAYS = 252;
/** Fewer closes than this in the window gives no risk figures (new listings, broken feeds). */
export const MIN_CLOSES = 200;

/** Bar time is NY wall-clock encoded as UTC seconds; the calendar date is its UTC date. */
const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

/** The closes of the last 365 calendar days ending at the last bar (oldest first). */
export function lastYear(bars: readonly Bar[]): Bar[] {
  if (bars.length === 0) return [];
  const end = bars[bars.length - 1].t;
  return bars.filter((b) => b.t > end - WINDOW_DAYS * DAY_SEC && b.c > 0);
}

/** Sample standard deviation of daily log returns x sqrt(252). Null with fewer than 2 returns. */
export function annualisedVolatility(closes: readonly number[]): number | null {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  if (r.length < 2) return null;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS);
}

/** Largest peak-to-trough fall of the closes, as a positive fraction (0.25 = fell 25% from a prior high). */
export function maxDrawdown(closes: readonly number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    worst = Math.max(worst, 1 - c / peak);
  }
  return worst;
}

export type RiskMetrics = { volatility1y: ScanMetric; maxDrawdown1y: ScanMetric; return1y: ScanMetric };

export function riskMetrics(bars: readonly Bar[] | null, chartUrl: string, failure?: string): RiskMetrics {
  const year = bars ? lastYear(bars) : [];
  const first = year[0];
  const last = year[year.length - 1];
  const asOf = last ? dateOf(last.t) : "";
  const provenance: Provenance = {
    source: "cnbc",
    asOf,
    session: "closed",
    url: chartUrl,
    note: first && last ? `${year.length} daily closes, ${dateOf(first.t)} to ${dateOf(last.t)}` : undefined,
  };
  const reason = failure ?? (year.length < MIN_CLOSES ? `Only ${year.length} daily closes in the last year (needs ${MIN_CLOSES})` : undefined);
  const make = (value: number | null, formula: string): ScanMetric =>
    reason || value === null
      ? { value: null, unit: "fraction", formula, provenance, reason: reason ?? "Not computable" }
      : { value, unit: "fraction", formula, provenance };
  const closes = year.map((b) => b.c);
  return {
    volatility1y: make(annualisedVolatility(closes), "Volatility (1y) = standard deviation of daily log returns x sqrt(252)"),
    maxDrawdown1y: make(maxDrawdown(closes), "Max drawdown (1y) = largest fall from a running high of daily closes"),
    return1y: make(first && last ? last.c / first.c - 1 : null, "Return (1y) = last close / close 365 days earlier - 1 (price only, no dividends)"),
  };
}

/** CNBC's published beta (CNBC does not state the window or benchmark). */
export function betaMetric(raw: string | undefined, quoteProv: Provenance | null): ScanMetric {
  const formula = "Beta as reported by CNBC (window and benchmark not published by the provider)";
  const value = raw !== undefined && raw.trim() !== "" ? Number(raw.replace(/,/g, "")) : NaN;
  const provenance: Provenance = quoteProv ? { ...quoteProv, session: undefined, note: "CNBC quote fundamentals" } : { source: "cnbc", asOf: "" };
  if (!quoteProv) return { value: null, unit: "multiple", formula, provenance, reason: "No CNBC quote" };
  if (!Number.isFinite(value)) return { value: null, unit: "multiple", formula, provenance, reason: "CNBC publishes no beta for this stock" };
  return { value, unit: "multiple", formula, provenance };
}
