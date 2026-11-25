/**
 * Pure price statistics from CNBC daily bars, for the analyst's context. No network; unit-tested.
 * Bar times are New York wall-clock time encoded as UTC seconds, so the UTC date is the trading date.
 */
import type { Bar } from "@/lib/types";
import type { MoveWindow } from "./types";

const DAY = 86_400;
const LARGE_MOVE_PCT = 3;
const MAX_MOVES = 6;
const HISTORY_SLACK = 7 * DAY;
const MOVE_LIST: readonly MoveWindow[] = ["1d", "1w", "1m", "3m", "ytd", "1y"];
/** Short windows list their biggest daily moves whatever the size; longer ones keep only moves of LARGE_MOVE_PCT+. */
const UNFILTERED_WINDOWS: readonly MoveWindow[] = ["1d", "1w", "1m"];
const moveThreshold = (w: MoveWindow) => (UNFILTERED_WINDOWS.includes(w) ? 0 : LARGE_MOVE_PCT);

export type DailyMove = { date: string; close: number; changePct: number };

export type PriceStats = {
  lastDate: string;
  lastClose: number;
  /** Trailing returns in percent; null when history does not reach back far enough. */
  returns: { label: string; fromDate: string; fromClose: number; pct: number }[];
  high52w: { date: string; close: number } | null;
  low52w: { date: string; close: number } | null;
  /** Largest daily close-to-close moves in the window, biggest first. */
  largeMoves: DailyMove[];
};

export const dateOf = (t: number): string => new Date(t * 1000).toISOString().slice(0, 10);

function monthsBack(t: number, months: number): number {
  const d = new Date(t * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate()) / 1000;
}

/** Start instant (exclusive base) of each window, measured back from the last bar. */
export function windowStart(lastT: number, w: MoveWindow): number {
  switch (w) {
    case "1d":
      return lastT - 1;
    case "1w":
      return lastT - 7 * DAY;
    case "1m":
      return monthsBack(lastT, 1);
    case "3m":
      return monthsBack(lastT, 3);
    case "ytd":
      return Date.UTC(new Date(lastT * 1000).getUTCFullYear(), 0, 1) / 1000 - 1;
    case "1y":
      return monthsBack(lastT, 12);
  }
}

/** Index of the last bar at or before t, or -1. */
function indexAt(bars: readonly Bar[], t: number): number {
  let found = -1;
  for (let i = 0; i < bars.length && bars[i].t <= t; i++) found = i;
  return found;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export const WINDOW_LABEL: Record<MoveWindow, string> = { "1d": "1 day", "1w": "1 week", "1m": "1 month", "3m": "3 months", ytd: "Year to date", "1y": "1 year" };

/** Daily moves of `bars` after index `from`, filtered to |move| >= threshold, largest first. */
export function largeMoves(bars: readonly Bar[], from: number, thresholdPct = LARGE_MOVE_PCT, limit = MAX_MOVES): DailyMove[] {
  const moves: DailyMove[] = [];
  for (let i = Math.max(1, from + 1); i < bars.length; i++) {
    const prev = bars[i - 1].c;
    if (prev <= 0) continue;
    const changePct = (bars[i].c / prev - 1) * 100;
    if (Math.abs(changePct) >= thresholdPct) moves.push({ date: dateOf(bars[i].t), close: bars[i].c, changePct: round(changePct) });
  }
  return moves.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, limit);
}

/**
 * Stats from daily bars (oldest first). `moveWindow` picks the span searched for large moves
 * (default 3 months). Returns null without at least two bars.
 */
export function priceStats(bars: readonly Bar[], moveWindow: MoveWindow = "3m"): PriceStats | null {
  const clean = bars.filter((b) => Number.isFinite(b.c) && b.c > 0);
  if (clean.length < 2) return null;
  const last = clean[clean.length - 1];
  const returns: PriceStats["returns"] = [];
  for (const w of MOVE_LIST) {
    const start = windowStart(last.t, w);
    let i = w === "1d" ? clean.length - 2 : indexAt(clean, start);
    // A one-year chart may start a few days after the exact anniversary; the base date is shown, so use it.
    if (w !== "1d" && i < 0 && clean[0].t - start <= HISTORY_SLACK) i = 0;
    if (i < 0) continue;
    const base = clean[i];
    returns.push({ label: WINDOW_LABEL[w], fromDate: dateOf(base.t), fromClose: base.c, pct: round((last.c / base.c - 1) * 100) });
  }
  const yearAgo = monthsBack(last.t, 12);
  const year = clean.filter((b) => b.t > yearAgo);
  const hi = year.reduce<Bar | null>((m, b) => (!m || b.c > m.c ? b : m), null);
  const lo = year.reduce<Bar | null>((m, b) => (!m || b.c < m.c ? b : m), null);
  const from = moveWindow === "1d" ? clean.length - 2 : indexAt(clean, windowStart(last.t, moveWindow));
  return {
    lastDate: dateOf(last.t),
    lastClose: last.c,
    returns,
    high52w: hi ? { date: dateOf(hi.t), close: hi.c } : null,
    low52w: lo ? { date: dateOf(lo.t), close: lo.c } : null,
    largeMoves: largeMoves(clean, Math.max(0, from), moveThreshold(moveWindow)),
  };
}

/** Compact text for the model. */
export function priceStatsContent(symbol: string, s: PriceStats, moveWindow: MoveWindow): string {
  const threshold = moveThreshold(moveWindow);
  const lines = [
    `${symbol} daily closes. Last close ${s.lastClose} on ${s.lastDate}.`,
    `Returns to the last close: ${s.returns.map((r) => `${r.label} ${r.pct}% (from ${r.fromClose} on ${r.fromDate})`).join("; ") || "not enough history"}.`,
    s.high52w && s.low52w ? `52-week closing high ${s.high52w.close} on ${s.high52w.date}; closing low ${s.low52w.close} on ${s.low52w.date}.` : "52-week range not available.",
    s.largeMoves.length
      ? `Largest daily moves over ${WINDOW_LABEL[moveWindow].toLowerCase()}${threshold ? ` (at least ${threshold}%)` : ""}: ${s.largeMoves.map((m) => `${m.date} ${m.changePct > 0 ? "+" : ""}${m.changePct}% to ${m.close}`).join("; ")}.`
      : threshold
        ? `No daily move of ${threshold}% or more over ${WINDOW_LABEL[moveWindow].toLowerCase()}.`
        : `No daily moves over ${WINDOW_LABEL[moveWindow].toLowerCase()}.`,
  ];
  return lines.join("\n");
}
