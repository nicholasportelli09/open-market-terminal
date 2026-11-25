import type { Bar, Range } from "@/lib/types";
import { formatBarTime } from "./chart-data";
import type { Interval } from "./chart-intervals";

/** The change between two bars of the chart, earliest first, whichever way the user dragged. */
export type Measure = {
  /** Bar indexes, lo < hi. */
  lo: number;
  hi: number;
  start: Bar;
  end: Bar;
  change: number;
  /** Null when the start value is zero or negative (e.g. a negative yield), where a percent means nothing. */
  pct: number | null;
  up: boolean;
};

/** Measures between bar positions `a` and `b` (fractional positions round to the nearest bar). */
export function measureBetween(bars: readonly Bar[], a: number, b: number): Measure | null {
  if (bars.length === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const clamp = (i: number) => Math.min(Math.max(Math.round(i), 0), bars.length - 1);
  const lo = Math.min(clamp(a), clamp(b));
  const hi = Math.max(clamp(a), clamp(b));
  if (lo === hi) return null;
  const start = bars[lo];
  const end = bars[hi];
  const change = end.c - start.c;
  return { lo, hi, start, end, change, pct: start.c > 0 ? (change / start.c) * 100 : null, up: change >= 0 };
}

/** Index of the bar at time `t`, or of the nearest bar when that exact time is gone (data refreshed). */
export function indexOfTime(bars: readonly Bar[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(bars[lo - 1].t - t) <= Math.abs(bars[lo].t - t) ? lo - 1 : lo;
}

/** "Jul 29 – Aug 13, 2026" for one year, otherwise both ends in the chart's own bar format. */
export function formatSpan(fromT: number, toT: number, range: Range, interval?: Interval): string {
  // 1D labels are times only; a span reaching into an earlier session needs the dates too.
  const sameDay = Math.floor(fromT / 86_400) === Math.floor(toT / 86_400);
  const r: Range = range === "1D" && !sameDay ? "5D" : range;
  const a = formatBarTime(fromT, r, interval);
  const b = formatBarTime(toT, r, interval);
  const year = /, (\d{4})$/;
  const ya = a.match(year)?.[1];
  if (ya && ya === b.match(year)?.[1]) return `${a.replace(year, "")} – ${b}`;
  return `${a} – ${b}`;
}
