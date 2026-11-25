import type { Bar, Range } from "@/lib/types";

const DAY = 86_400;
/** Intraday buckets start on the first half hour of each day's data (9:30, 10:30 ... for US stocks). */
const INTRADAY_ANCHOR = 1_800;

export const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M", "3M", "1Y"] as const;
export type Interval = (typeof INTERVALS)[number];

/** Nominal length of each interval in seconds (calendar intervals are approximate). */
export const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1_800,
  "1h": 3_600,
  "4h": 14_400,
  "1D": DAY,
  "1W": 7 * DAY,
  "1M": 30 * DAY,
  "3M": 91 * DAY,
  "1Y": 365 * DAY,
};

export const INTERVAL_NAMES: Record<Interval, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1h": "1 hour",
  "4h": "4 hours",
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "1Y": "1 year",
};

/** Candle intervals each range offers (limited by the resolution of its data) and the default. */
export const RANGE_INTERVALS: Record<Range, { options: readonly Interval[]; fallback: Interval }> = {
  "1D": { options: ["1m", "5m", "15m", "30m", "1h"], fallback: "5m" },
  "5D": { options: ["5m", "15m", "30m", "1h", "4h"], fallback: "30m" },
  "1M": { options: ["1D", "1W", "1M"], fallback: "1D" },
  "6M": { options: ["1D", "1W", "1M"], fallback: "1D" },
  YTD: { options: ["1D", "1W", "1M"], fallback: "1D" },
  "1Y": { options: ["1D", "1W", "1M"], fallback: "1D" },
  "5Y": { options: ["1W", "1M", "3M"], fallback: "1W" },
  MAX: { options: ["3M", "1Y"], fallback: "3M" },
};

/** The picked interval if this range offers it, otherwise the range's default. */
export function resolveInterval(range: Range, picked: Interval | null): Interval {
  const { options, fallback } = RANGE_INTERVALS[range];
  return picked && options.includes(picked) ? picked : fallback;
}

export function isIntraday(interval: Interval): boolean {
  return INTERVAL_SECONDS[interval] < DAY;
}

/** Start of the calendar period containing t. Weeks start on Sunday, matching CNBC's weekly bars. */
export function periodStart(t: number, interval: Interval): number {
  const day = t - (t % DAY);
  const d = new Date(t * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (interval) {
    case "1W":
      return day - d.getUTCDay() * DAY;
    case "1M":
      return Date.UTC(y, m, 1) / 1000;
    case "3M":
      return Date.UTC(y, m - (m % 3), 1) / 1000;
    case "1Y":
      return Date.UTC(y, 0, 1) / 1000;
    default:
      return day;
  }
}

/** Merges bars into candles of `interval`. Returns the input when the data is already that coarse. */
export function aggregateTo(bars: Bar[], interval: Interval, baseStep: number): Bar[] {
  const size = INTERVAL_SECONDS[interval];
  if (size <= baseStep) return bars;
  let anchorDay = -1;
  let anchor = 0;
  const keyOf = (t: number) => {
    if (size >= DAY) return periodStart(t, interval);
    const day = t - (t % DAY);
    if (day !== anchorDay) {
      anchorDay = day;
      anchor = t - (t % INTRADAY_ANCHOR);
    }
    return anchor + Math.floor((t - anchor) / size) * size;
  };
  const out: Bar[] = [];
  for (const b of bars) {
    const t = keyOf(b.t);
    const cur = out[out.length - 1];
    if (cur && cur.t === t) {
      out[out.length - 1] = { ...cur, h: Math.max(cur.h, b.h), l: Math.min(cur.l, b.l), c: b.c, v: cur.v + b.v };
    } else {
      out.push({ ...b, t });
    }
  }
  return out;
}

/** Index of the candle containing `t` (the first candle when t is before all of them). */
export function indexContaining(bars: Bar[], t: number | null): number {
  if (t == null) return 0;
  let i = 0;
  while (i + 1 < bars.length && bars[i + 1].t <= t) i++;
  return i;
}
