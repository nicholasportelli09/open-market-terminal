/**
 * Pure helpers for /api/fx-history: pick the close on (or the last close before) a trade date from
 * CNBC daily or weekly bars, and cross two USD legs into "base per 1 unit of currency".
 *
 * CNBC bar dates: daily FX bars carry the trading day. Weekend-dated daily bars (the short
 * Sunday-evening session, which repeats Friday's close) are dropped so a weekend date resolves to the
 * real Friday close and reports Friday's date. Weekly bars are labelled with the Sunday that starts the week; their close is that
 * week's Friday close, so a weekly bar only counts once its Friday (label + 5 days) is on or before
 * the requested date. Nothing is interpolated: a rate is always one real close.
 */
import type { Bar } from "@/lib/types";

export type DatedClose = { date: string; close: number };
export type Resolution = "daily" | "weekly";

/** Days after a weekly bar's Sunday label on which its close (Friday) is struck. */
export const WEEKLY_CLOSE_OFFSET_DAYS = 5;

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const SATURDAY = 6;
const SUNDAY = 0;

/**
 * CNBC bar times are exchange wall-clock encoded as UTC seconds; the date is the UTC date part.
 * Daily bars dated on a weekend are skipped (weekly bars are labelled Sunday, so they are kept).
 */
export function barsToCloses(bars: readonly Bar[], resolution: Resolution): DatedClose[] {
  const byDate = new Map<string, number>();
  for (const b of bars) {
    if (!Number.isFinite(b.c) || b.c <= 0) continue;
    const at = new Date(b.t * 1000);
    const day = at.getUTCDay();
    if (resolution === "daily" && (day === SATURDAY || day === SUNDAY)) continue;
    byDate.set(at.toISOString().slice(0, 10), b.c);
  }
  return [...byDate.entries()].map(([date, close]) => ({ date, close })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The date a close was actually struck: the bar date (daily) or the week's Friday (weekly). */
export function closeDate(barDate: string, resolution: Resolution): string {
  return resolution === "weekly" ? addDaysIso(barDate, WEEKLY_CLOSE_OFFSET_DAYS) : barDate;
}

/** A leg: null means USD itself (always 1 USD per unit). */
export type Leg = DatedClose[] | null;

export type CrossPick = {
  /** The bar date both legs share (weekly: the week's Sunday label). */
  barDate: string;
  /** When the close was struck (weekly: the Friday). Always on or before the requested date. */
  date: string;
  currencyClose: number | null;
  baseClose: number | null;
};

/**
 * The latest bar date on or before `target` that both legs have (a USD leg has every date).
 * Returns null when no common close exists on or before the date.
 */
export function pickCommonClose(currencyLeg: Leg, baseLeg: Leg, target: string, resolution: Resolution): CrossPick | null {
  const legs = [currencyLeg, baseLeg].filter((l): l is DatedClose[] => l !== null);
  if (legs.length === 0) return null;
  const maps = legs.map((l) => new Map(l.map((c) => [c.date, c.close])));
  const candidates = legs[0]
    .map((c) => c.date)
    .filter((d) => closeDate(d, resolution) <= target && maps.every((m) => m.has(d)))
    .sort();
  const barDate = candidates[candidates.length - 1];
  if (!barDate) return null;
  return {
    barDate,
    date: closeDate(barDate, resolution),
    currencyClose: currencyLeg ? (currencyLeg.find((c) => c.date === barDate)?.close ?? null) : null,
    baseClose: baseLeg ? (baseLeg.find((c) => c.date === barDate)?.close ?? null) : null,
  };
}

/** Daily bars when they reach back to the date for every non-USD leg, else weekly. */
export function chooseResolution(dailyLegs: Leg[], target: string): Resolution {
  const covered = dailyLegs.every((leg) => leg === null || (leg.length > 0 && leg[0].date <= target));
  return covered ? "daily" : "weekly";
}

/** Units of base per 1 unit of currency, from USD per unit of each (crossed through USD). */
export function crossToBase(usdPerCurrency: number, usdPerBase: number): number | null {
  if (!(usdPerCurrency > 0) || !(usdPerBase > 0)) return null;
  const rate = usdPerCurrency / usdPerBase;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
