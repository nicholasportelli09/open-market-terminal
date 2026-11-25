import type { IChartApi, LogicalRange } from "lightweight-charts";

export type ViewLayout = {
  /** Index of the first bar of the selected range. */
  presetIndex: number;
  /** Number of real bars. */
  dataCount: number;
  /** Whitespace slots appended after the data (session remainder on 1D). */
  padCount: number;
  mode: "line" | "candles";
};

const MIN_VISIBLE_BARS = 8;
const CANDLE_RIGHT_MARGIN = 4;

/** The view a range button stands for: Google-exact for line, a little breathing room for candles. */
export function presetRange(v: ViewLayout): { from: number; to: number } {
  const last = v.dataCount + v.padCount - 1;
  if (v.mode === "line") return { from: v.presetIndex - 0.5, to: last + 0.5 };
  return { from: v.presetIndex - 0.5, to: last + (v.padCount ? 0.5 : CANDLE_RIGHT_MARGIN) };
}

/** Zoom by `factor`, keeping the logical index `anchor` at the same place on screen. */
export function zoomAt(r: LogicalRange | { from: number; to: number }, factor: number, anchor: number) {
  const current = r.to - r.from;
  // Never let "zoom in" widen the view: clamp only down to the smaller of the floor and the current width.
  const width = factor < 1 ? Math.max(current * factor, Math.min(MIN_VISIBLE_BARS, current)) : current * factor;
  const p = Math.min(Math.max((anchor - r.from) / current, 0), 1);
  const from = anchor - p * width;
  return { from, to: from + width };
}

export function panRange(r: LogicalRange | { from: number; to: number }, fraction: number) {
  const shift = (r.to - r.from) * fraction;
  return { from: r.from + shift, to: r.to + shift };
}

/** Keep the current zoom width but bring the newest real bar back near the right edge. */
export function realtimeRange(r: LogicalRange | { from: number; to: number }, v: ViewLayout) {
  const width = r.to - r.from;
  const margin = v.padCount ? Math.min(v.padCount, width * 0.1) + 0.5 : v.mode === "candles" ? CANDLE_RIGHT_MARGIN : 0.5;
  const to = v.dataCount - 1 + margin;
  return { from: to - width, to };
}

/**
 * After new data arrives while the user was following the live edge: keep the zoom width and the
 * same distance to the newest bar (or to the end of the session padding, if that was in view).
 */
export function followLatest(r: LogicalRange | { from: number; to: number }, prev: ViewLayout, next: ViewLayout) {
  const width = r.to - r.from;
  const prevEnd = prev.dataCount + prev.padCount - 1;
  const showingPadEnd = prev.padCount > 0 && r.to >= prevEnd - 0.5;
  const to = showingPadEnd
    ? next.dataCount + next.padCount - 1 + (r.to - prevEnd)
    : next.dataCount - 1 + (r.to - (prev.dataCount - 1));
  return { from: to - width, to };
}

/** True when the latest real bar has scrolled off the right edge. */
export function isAwayFromLatest(r: { from: number; to: number } | null, v: ViewLayout | null): boolean {
  if (!r || !v || v.dataCount === 0) return false;
  return r.to < v.dataCount - 1.5;
}

/**
 * Where an old logical index lands after the bar array changed (refresh may drop old bars from
 * the front of a rolling window and append new ones at the back).
 */
export function indexShift(oldTimes: number[], newTimes: number[]): number {
  if (!oldTimes.length || !newTimes.length) return 0;
  const k = newTimes.indexOf(oldTimes[0]);
  if (k >= 0) return k;
  const j = oldTimes.indexOf(newTimes[0]);
  return j >= 0 ? -j : 0;
}

type Span = { from: number; to: number };

/**
 * lightweight-charts applies setVisibleLogicalRange on the next paint, so a read in the same frame
 * returns the old range. Remember what we asked for until it has been painted.
 */
const pending = new WeakMap<IChartApi, Span>();

export function setRange(chart: IChartApi, r: Span) {
  pending.set(chart, r);
  chart.timeScale().setVisibleLogicalRange(r);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (pending.get(chart) === r) pending.delete(chart);
  }));
}

/** The visible logical range, including a range requested this frame but not painted yet. */
export function readRange(chart: IChartApi): Span | null {
  return pending.get(chart) ?? chart.timeScale().getVisibleLogicalRange();
}
