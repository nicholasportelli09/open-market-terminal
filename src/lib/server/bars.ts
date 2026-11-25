import type { Bar, ChartPayload, Range } from "@/lib/types";
import type { RawChart } from "./cnbc";
export { presetBars } from "@/lib/chart-shared";

const DAY = 86_400;
const MAX_SESSION_HOURS = 12;

/** Which CNBC endpoint feeds each range (the endpoints return more history than their label). */
export const RANGE_SOURCE: Record<Range, { source: string; ttlMs: number }> = {
  "1D": { source: "1D", ttlMs: 10_000 },
  "5D": { source: "5D", ttlMs: 30_000 },
  "1M": { source: "1Y", ttlMs: 300_000 },
  "6M": { source: "1Y", ttlMs: 300_000 },
  YTD: { source: "1Y", ttlMs: 300_000 },
  "1Y": { source: "1Y", ttlMs: 300_000 },
  "5Y": { source: "5Y", ttlMs: 3_600_000 },
  MAX: { source: "ALL", ttlMs: 3_600_000 },
};

const CALENDAR_DAYS: Partial<Record<Range, number>> = { "1M": 31, "6M": 183, "1Y": 366, "5Y": 1827 };

function secondsOfDay(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function dayStart(t: number): number {
  return t - (t % DAY);
}

const NY_OFFSET = -5;
const SESSION_GAP_SEC = 90 * 60;
const US_OPEN_SOD = 9.5 * 3600;
const US_SESSION_SEC = 6.5 * 3600;

/** Regular-hours window (seconds-of-day, NY time) for NY-timezone listings that report one. */
function nySessionWindow(raw: RawChart): { open: number; close: number } | null {
  if (!raw.sessionOpen || !raw.sessionClose || raw.utcOffset !== NY_OFFSET) return null;
  const open = secondsOfDay(raw.sessionOpen);
  const close = secondsOfDay(raw.sessionClose);
  if (close <= open || close - open > MAX_SESSION_HOURS * 3600) return null;
  return { open, close };
}

function sessionLength(raw: RawChart): number | null {
  if (!raw.sessionOpen || !raw.sessionClose) return null;
  const len = secondsOfDay(raw.sessionClose) - secondsOfDay(raw.sessionOpen);
  return len > 0 && len <= MAX_SESSION_HOURS * 3600 ? len : null;
}

function medianStep(bars: Bar[]): number {
  if (bars.length < 3) return 60;
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(bars.length, 200); i++) gaps.push(bars[i].t - bars[i - 1].t);
  gaps.sort((a, b) => a - b);
  return Math.max(60, gaps[Math.floor(gaps.length / 2)]);
}

function inSession(bars: Bar[], win: { open: number; close: number }): Bar[] {
  return bars.filter((b) => {
    const sod = b.t % DAY;
    return sod >= win.open && sod < win.close;
  });
}

/**
 * Bars from the last `count` trading days. `localShift` moves New York wall-clock bar times to the exchange's
 * own clock before grouping, so an Asian session that straddles New York midnight counts as one day.
 */
function lastDays(bars: Bar[], count: number, localShift = 0): Bar[] {
  const days = [...new Set(bars.map((b) => dayStart(b.t + localShift)))].slice(-count);
  const first = days[0];
  return first === undefined ? [] : bars.filter((b) => dayStart(b.t + localShift) >= first);
}

/**
 * Seconds from New York wall-clock time to the exchange's (standard-time offsets; a daylight-saving hour
 * never moves a session across local midnight). Zero for New York listings or when the offset is unknown.
 */
function localShiftOf(raw: RawChart): number {
  if (raw.utcOffset === null || raw.utcOffset === NY_OFFSET || raw.utcOffset === NY_OFFSET + 1) return 0;
  return (raw.utcOffset - NY_OFFSET) * 3600;
}

/** The latest continuous run of bars (a gap of 90+ minutes ends a session), capped at 24h. */
function latestRun(bars: Bar[]): Bar[] {
  let i = bars.length - 1;
  const lastT = bars[i].t;
  while (i > 0 && bars[i].t - bars[i - 1].t < SESSION_GAP_SEC && lastT - bars[i - 1].t < DAY) i--;
  return bars.slice(i);
}

type Shaped = { history: Bar[]; bars: Bar[]; sessionEnd: number | null };

function trimIntraday(range: Range, raw: RawChart): Shaped {
  const all = raw.bars;
  if (all.length === 0) return { history: [], bars: [], sessionEnd: null };
  const win = nySessionWindow(raw);
  // Scroll-back history: regular-hours bars only for NY listings, so extended-hours gaps do not appear.
  const history = win ? inSession(all, win) : all;

  if (range === "5D") return { history, bars: lastDays(history, 5, localShiftOf(raw)), sessionEnd: null };

  let bars = latestRun(all);
  if (win) {
    const regular = inSession(bars, win);
    if (regular.length) bars = regular;
  }
  const first = bars[0].t;
  const len = sessionLength(raw) ?? (raw.timeZone === "EST" && first % DAY === US_OPEN_SOD ? US_SESSION_SEC : null);
  const spansDay = bars[bars.length - 1].t - first > MAX_SESSION_HOURS * 3600;
  // The selected session must be the tail of the history array.
  const tail = history.length && history[history.length - 1].t === bars[bars.length - 1].t ? history : all;
  // Upstream session hours can be stale (e.g. Tokyo's later close), so never end before the last bar.
  const lastT = bars[bars.length - 1].t;
  const sessionEnd = len && !spansDay ? Math.max(first + len, lastT + medianStep(bars)) : null;
  return { history: tail, bars, sessionEnd };
}

function trimDaily(range: Range, bars: Bar[]): Bar[] {
  if (bars.length === 0 || range === "MAX") return bars;
  const lastT = bars[bars.length - 1].t;
  if (range === "YTD") {
    const year = new Date(lastT * 1000).getUTCFullYear();
    const start = Date.UTC(year, 0, 1) / 1000;
    return bars.filter((b) => b.t >= start);
  }
  const days = CALENDAR_DAYS[range] ?? 366;
  return bars.filter((b) => b.t > lastT - days * DAY);
}

export function shapeChart(symbol: string, range: Range, raw: RawChart): ChartPayload {
  const intraday = range === "1D" || range === "5D";
  const { history, bars, sessionEnd } = intraday
    ? trimIntraday(range, raw)
    : { history: raw.bars, bars: trimDaily(range, raw.bars), sessionEnd: null };
  return {
    symbol,
    range,
    bars: history,
    presetStart: bars[0]?.t ?? null,
    step: medianStep(bars.length >= 3 ? bars : history),
    sessionEnd,
    timeZone: "America/New_York",
  };
}

/** Evenly downsample closes for sparklines. */
export function sparkline(bars: Bar[], points = 64): number[] {
  if (bars.length <= points) return bars.map((b) => b.c);
  const out: number[] = [];
  const stride = (bars.length - 1) / (points - 1);
  for (let i = 0; i < points; i++) out.push(bars[Math.round(i * stride)].c);
  return out;
}
