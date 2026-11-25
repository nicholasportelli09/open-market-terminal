/**
 * Live (CNBC) cards: the live price joined to a year of CNBC daily closes, so 1m / 1y changes use
 * the same source as the price. Pure functions; the hooks live in components/macro.
 */
import { changeOver, trailing, type PeriodChange, type Point } from "./math";

export type LiveSeries = { points: Point[]; latest: Point; m1: PeriodChange | null; y1: PeriodChange | null };

const DAILY_GAP_DAYS = 7;

/**
 * Replaces any close dated on or after `dateKey` with the live value (the feed's bar for today is
 * the same price still moving), then measures 1m and 1y changes against earlier daily closes.
 */
export function liveSeries(history: readonly Point[], last: number, dateKey: string): LiveSeries {
  const latest = { date: dateKey, value: last };
  const points = [...history.filter((p) => p.date < dateKey), latest];
  return {
    points,
    latest,
    m1: changeOver(points, latest, 1, DAILY_GAP_DAYS),
    y1: changeOver(points, latest, 12, DAILY_GAP_DAYS),
  };
}

const MAX_DECIMALS = 6;
const PRECISION_LOOKBACK = 5;

/** Number of decimals a value is written with (0 to 6), e.g. 0.84 -> 2, 0.8431 -> 4. */
export function decimalsOf(v: number): number {
  for (let d = 0; d < MAX_DECIMALS; d++) {
    const scaled = v * 10 ** d;
    if (Math.abs(Math.round(scaled) - scaled) < 1e-6) return d;
  }
  return MAX_DECIMALS;
}

/**
 * Like liveSeries, for measuring % changes: when the live quote is rounded more coarsely than the
 * recent daily closes (CNBC sends some FX pairs, e.g. USD/CHF, at 2 dp while closes carry 4), it
 * ends at the latest daily close before today instead, so rounding does not swamp the change.
 */
export function precisePairSeries(history: readonly Point[], last: number, quoteDecimals: number, dateKey: string): LiveSeries {
  const prior = history.filter((p) => p.date < dateKey);
  const end = prior[prior.length - 1];
  const closeDecimals = Math.max(0, ...prior.slice(-PRECISION_LOOKBACK).map((p) => decimalsOf(p.value)));
  if (end && quoteDecimals < closeDecimals) return liveSeries(prior, end.value, end.date);
  return liveSeries(history, last, dateKey);
}

export function liveSpark(s: LiveSeries): Point[] {
  return trailing(s.points, 12);
}

/**
 * 1-year % change in the USD value of one unit of a currency, from its CNBC pair series.
 * `direct` is true when the pair is quoted as USD per unit (EUR/USD), false for units per USD (USD/JPY).
 */
export function usdValueChange(y1: PeriodChange | null, latest: number, direct: boolean): number | null {
  if (!y1 || !(y1.from.value > 0) || !(latest > 0)) return null;
  return direct ? (latest / y1.from.value - 1) * 100 : (y1.from.value / latest - 1) * 100;
}
