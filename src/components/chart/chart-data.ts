import type { Bar, Range } from "@/lib/types";
import { INTERVAL_SECONDS, isIntraday, periodStart, type Interval } from "./chart-intervals";

/** Empty time slots until the session close so 1D charts span the whole day, like Google Finance. */
export function whitespaceUntil(lastT: number, sessionEnd: number | null, step: number): number[] {
  if (!sessionEnd || lastT >= sessionEnd) return [];
  const out: number[] = [];
  for (let t = lastT + step; t < sessionEnd; t += step) out.push(t);
  return out;
}

/** "2026-11-20T11:21:18.398-0500" -> exchange wall-clock seconds encoded as UTC (same encoding as bars). */
export function wallClockSeconds(iso: string | null): number | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 1000;
}

/** Applies a live trade to the bar list, returning the bar that changed. New bars keep the grid of the last bar. */
export function applyTick(bars: Bar[], price: number, tSec: number, step: number): { bars: Bar[]; bar: Bar } | null {
  const last = bars[bars.length - 1];
  if (!last || tSec < last.t) return null;
  if (tSec < last.t + step) {
    const bar = { ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) };
    return { bars: [...bars.slice(0, -1), bar], bar };
  }
  const t = last.t + step * Math.floor((tSec - last.t) / step);
  const bar = { t, o: last.c, h: Math.max(last.c, price), l: Math.min(last.c, price), c: price, v: 0 };
  return { bars: [...bars, bar], bar };
}

const RANGE_LABEL: Record<Range, string> = {
  "1D": "today",
  "5D": "past 5 days",
  "1M": "past month",
  "6M": "past 6 months",
  YTD: "year to date",
  "1Y": "past year",
  "5Y": "past 5 years",
  MAX: "all time",
};

export function rangeLabel(range: Range): string {
  return RANGE_LABEL[range];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(d: Date): string {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export function formatBarTime(t: number, range: Range, interval?: Interval): string {
  const d = new Date(t * 1000);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (range === "1D") return clock(d);
  if (range === "5D") return `${date}, ${clock(d)}`;
  if (interval === "1Y") return String(d.getUTCFullYear());
  if (interval === "1M" || interval === "3M") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (interval === "1W") return `Week of ${date}, ${d.getUTCFullYear()}`;
  return `${date}, ${d.getUTCFullYear()}`;
}

/**
 * Tick label. Intraday ranges show the date on the first bar of each day and the time elsewhere;
 * daily ranges follow lightweight-charts TickMarkType (0 year, 1 month, 2 day).
 */
export function formatTick(t: number, tickType: number, range: Range, dayStarts: Set<number>): string {
  const d = new Date(t * 1000);
  if (range === "1D" || range === "5D") {
    return dayStarts.has(t) ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : clock(d).replace(":00 ", " ");
  }
  if (tickType === 0) return String(d.getUTCFullYear());
  if (tickType === 1) return MONTHS[d.getUTCMonth()];
  if (tickType === 2) return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return clock(d).replace(":00 ", " ");
}

const DAY = 86_400;

/** Times of the first bar of each calendar day, for intraday date ticks. */
export function firstBarOfEachDay(bars: Bar[]): Set<number> {
  const out = new Set<number>();
  let prevDay = -1;
  for (const b of bars) {
    const day = b.t - (b.t % DAY);
    if (day !== prevDay) out.add(b.t);
    prevDay = day;
  }
  return out;
}

type LiveDay = { open: number | null; high: number | null; low: number | null; last: number; volume: number | null; t: number };

/** Adds (or refreshes) the current day/week/month/... candle from the live quote. Intraday bars use applyTick. */
export function withLiveBar(bars: Bar[], interval: Interval, live: LiveDay | null): Bar[] {
  const last = bars[bars.length - 1];
  if (!last || !live || isIntraday(interval)) return bars;
  const t = periodStart(live.t, interval);
  if (t < last.t) return bars;
  const daily = INTERVAL_SECONDS[interval] === DAY;
  const high = Math.max(live.high ?? live.last, live.last);
  const low = Math.min(live.low ?? live.last, live.last);
  if (t === last.t) {
    const bar = { ...last, c: live.last, h: Math.max(daily ? high : last.h, high, last.o), l: Math.min(daily ? low : last.l, low, last.o), v: daily ? live.volume ?? last.v : last.v };
    return [...bars.slice(0, -1), bar];
  }
  const o = live.open ?? last.c;
  return [...bars, { t, o, h: Math.max(high, o), l: Math.min(low, o), c: live.last, v: live.volume ?? 0 }];
}
