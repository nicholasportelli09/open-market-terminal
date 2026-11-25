/**
 * Market sessions: which trading session an instrument is in at a given instant.
 * Pure functions, no React, safe on server and client. All exchange times are New York time
 * (America/New_York via Intl), so DST is handled by the runtime's time zone database.
 *
 * NYSE calendar: ./nyse-calendar.ts (2025-2027). Dates outside it are treated as ordinary weekdays
 * (`calendarCovered: false`). Non-US index hours: ./world-sessions.ts.
 */
import type { PriceSession, Provenance } from "./provenance";
import { NYSE_CALENDAR_YEARS, NYSE_EARLY_CLOSES, NYSE_HOLIDAYS } from "./nyse-calendar";
import { krxSession, listedIndexOpen } from "./world-sessions";

export { NYSE_EARLY_CLOSES, NYSE_HOLIDAYS };

const NY = "America/New_York";

// Minutes after New York midnight.
const PRE_OPEN = 4 * 60;
const REGULAR_OPEN = 9 * 60 + 30;
const REGULAR_CLOSE = 16 * 60;
const EARLY_CLOSE = 13 * 60;
const POST_CLOSE = 20 * 60;
const EARLY_POST_CLOSE = 17 * 60;
const FX_ROLL = 17 * 60;
const GLOBEX_REOPEN = 18 * 60;
const TREASURY_OPEN = 8 * 60;
const TREASURY_CLOSE = 17 * 60;
const NON_US_STALE_MS = 30 * 60_000;
const MAX_LOOKAHEAD_DAYS = 14;

export type NyParts = {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Minutes after midnight, New York time. */
  minutes: number;
  /** YYYY-MM-DD in New York. */
  dateKey: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let partsFormatter: Intl.DateTimeFormat | null = null;

export function nyParts(at: Date): NyParts {
  partsFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: NY, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const get: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(at)) get[p.type] = p.value;
  const year = +get.year, month = +get.month, day = +get.day;
  const hour = +get.hour % 24, minute = +get.minute, second = +get.second;
  return {
    year, month, day, hour, minute, second,
    weekday: WEEKDAYS.indexOf(get.weekday),
    minutes: hour * 60 + minute,
    dateKey: `${get.year}-${get.month}-${get.day}`,
  };
}

function offsetMs(at: Date): number {
  const p = nyParts(at);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which New York wall-clock time reads `minutes` after midnight on `dateKey`. */
export function nyDateTime(dateKey: string, minutes: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  const first = wall - offsetMs(new Date(wall));
  const second = wall - offsetMs(new Date(first));
  return new Date(second);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function nyseHoliday(dateKey: string): string | undefined {
  return NYSE_HOLIDAYS[dateKey];
}

export function isEarlyClose(dateKey: string): boolean {
  return NYSE_EARLY_CLOSES.includes(dateKey);
}

export function isTradingDay(dateKey: string): boolean {
  const wd = weekdayOf(dateKey);
  return wd !== 0 && wd !== 6 && !nyseHoliday(dateKey);
}

/** Regular-session close (minutes after NY midnight) for a trading day. */
export function regularCloseMinutes(dateKey: string): number {
  return isEarlyClose(dateKey) ? EARLY_CLOSE : REGULAR_CLOSE;
}

/** The next 9:30 AM ET regular open strictly after `at` (today's if it is still ahead). */
export function nextRegularOpen(at: Date): Date | undefined {
  const p = nyParts(at);
  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const key = addDays(p.dateKey, i);
    if (i === 0 && p.minutes >= REGULAR_OPEN) continue;
    if (isTradingDay(key)) return nyDateTime(key, REGULAR_OPEN);
  }
  return undefined;
}

export type UsEquitySession = {
  session: "pre" | "regular" | "post" | "closed";
  reason?: "weekend" | "holiday" | "overnight";
  holidayName?: string;
  /** Today (New York) is an NYSE early-close day (regular ends 1:00 PM, post 5:00 PM). */
  earlyClose: boolean;
  /** Next regular-session open, when not in the regular session. */
  opensAt?: Date;
  /** Current regular-session close, when in the regular session. */
  closesAt?: Date;
  /** False when the date is outside the built-in 2025-2027 holiday calendar. */
  calendarCovered: boolean;
};

export function usEquitySession(at: Date): UsEquitySession {
  const p = nyParts(at);
  const calendarCovered = NYSE_CALENDAR_YEARS.includes(p.year);
  const closed = (reason: UsEquitySession["reason"], holidayName?: string): UsEquitySession => ({
    session: "closed", reason, holidayName, earlyClose: false, opensAt: nextRegularOpen(at), calendarCovered,
  });
  if (p.weekday === 0 || p.weekday === 6) return closed("weekend");
  const holiday = nyseHoliday(p.dateKey);
  if (holiday) return closed("holiday", holiday);

  const earlyClose = isEarlyClose(p.dateKey);
  const close = earlyClose ? EARLY_CLOSE : REGULAR_CLOSE;
  const postClose = earlyClose ? EARLY_POST_CLOSE : POST_CLOSE;
  const base = { earlyClose, calendarCovered };
  if (p.minutes < PRE_OPEN) return { ...closed("overnight"), earlyClose };
  if (p.minutes < REGULAR_OPEN) return { ...base, session: "pre", opensAt: nyDateTime(p.dateKey, REGULAR_OPEN) };
  if (p.minutes < close) return { ...base, session: "regular", closesAt: nyDateTime(p.dateKey, close) };
  if (p.minutes < postClose) return { ...base, session: "post", opensAt: nextRegularOpen(at) };
  return { ...closed("overnight"), earlyClose };
}

/** Fields of a quote that decide its session (a subset of `Quote`). */
export type SessionQuote = {
  symbol: string;
  type: string;
  exchange?: string;
  /** ISO country code from the feed (CNBC `countryCode`). */
  country?: string;
  /** Last update: ISO timestamp, or a bare YYYY-MM-DD when the feed gives only a date. */
  time: string | null;
  /** Feed's market state; used for Korean listings (Naver: CLOSED, PRE, REGULAR, POST). */
  marketStatus?: string;
};

export type InstrumentClass = "crypto" | "fx" | "future" | "us-equity" | "us-index" | "us-treasury" | "other";

const US_EXCHANGES = /NASDAQ|NYSE|Cboe|BATS|AMEX|OTC/i;
/** US indices that CNBC tags with a non-US country code. */
const US_INDEX_SYMBOLS = new Set([".VIX"]);

export function classifyInstrument(q: Pick<SessionQuote, "symbol" | "type" | "exchange" | "country">): InstrumentClass {
  const type = q.type.toUpperCase();
  const us = q.country === "US";
  if (/\.CM=$/.test(q.symbol) || type === "CRYPTO") return "crypto";
  if (q.symbol.startsWith("@")) return "future";
  // The dollar index is computed around the clock on FX hours, so it follows the FX week.
  if (type === "CURRENCY" || q.symbol === ".DXY" || /^[A-Z]{3,6}=$/.test(q.symbol)) return "fx";
  if (type === "BOND") return us || /^US\d+[MY]$/.test(q.symbol) ? "us-treasury" : "other";
  if (type === "STOCK") return us || (!q.country && US_EXCHANGES.test(q.exchange ?? "")) ? "us-equity" : "other";
  if (type === "INDEX") return us || US_INDEX_SYMBOLS.has(q.symbol) ? "us-index" : "other";
  return "other";
}

const HAS_CLOCK_TIME = /T\d{2}:\d{2}/;

/** Spot FX week: Sunday 17:00 to Friday 17:00 ET, no daily break. */
function fxOpen(p: NyParts): boolean {
  if (p.weekday === 0) return p.minutes >= FX_ROLL;
  if (p.weekday === 6) return false;
  return p.weekday < 5 || p.minutes < FX_ROLL;
}

/**
 * CME Globex: Sunday 18:00 to Friday 17:00 ET with a daily 17:00-18:00 halt.
 * Approximation: closed all day on NYSE full holidays (CME usually trades a shortened session there).
 */
function globexOpen(p: NyParts): boolean {
  if (p.weekday === 6 || nyseHoliday(p.dateKey)) return false;
  if (p.weekday === 0) return p.minutes >= GLOBEX_REOPEN;
  if (p.weekday === 5) return p.minutes < FX_ROLL;
  return p.minutes < FX_ROLL || p.minutes >= GLOBEX_REOPEN;
}

/**
 * Session of the instrument's price at `at`.
 * - crypto: continuous. Spot FX (and the dollar index): continuous during the FX week, else closed.
 * - CME futures ("@" symbols): regular while Globex trades (see globexOpen), else closed.
 * - US stocks/ETFs: the NYSE session (pre/regular/post/closed). US indices: regular or closed.
 * - US Treasury yields: regular 08:00-17:00 ET on NYSE trading days (SIFMA bond holidays such as
 *   Columbus Day and Veterans Day are not modelled), else closed.
 * - Non-US indices with an hours table (world-sessions.ts): closed outside local hours; inside, a bare
 *   date must be today's local date. Everything else (and clock times inside hours): heuristic on the
 *   feed's last update. A clock time within the last 30 minutes means regular; older, date-only or
 *   missing means closed.
 */
export function instrumentSession(q: SessionQuote, at: Date): PriceSession {
  const cls = classifyInstrument(q);
  const p = nyParts(at);
  switch (cls) {
    case "crypto":
      return "continuous";
    case "fx":
      return fxOpen(p) ? "continuous" : "closed";
    case "future":
      return globexOpen(p) ? "regular" : "closed";
    case "us-equity":
      return usEquitySession(at).session;
    case "us-index":
      return usEquitySession(at).session === "regular" ? "regular" : "closed";
    case "us-treasury": {
      const open = isTradingDay(p.dateKey) && p.minutes >= TREASURY_OPEN && p.minutes < TREASURY_CLOSE;
      return open ? "regular" : "closed";
    }
    default: {
      // Korean shares (Naver): KRX hours plus Nextrade's pre- and after-market.
      if (/^[0-9A-Z]{6}-KR$/.test(q.symbol)) return krxSession(q.marketStatus, at);
      const listed = listedIndexOpen(q.symbol, q.time, at);
      if (listed !== undefined) return listed ? "regular" : "closed";
      if (!q.time || !HAS_CLOCK_TIME.test(q.time)) return "closed";
      const t = Date.parse(q.time);
      if (!Number.isFinite(t)) return "closed";
      return at.getTime() - t > NON_US_STALE_MS ? "closed" : "regular";
    }
  }
}

export type QuoteStamp = {
  /** The instant, when the feed gives (or implies) a clock time. */
  at: Date | null;
  /** YYYY-MM-DD the value belongs to (New York date for timed values). */
  dateKey: string;
};

/** Tolerance for feed clocks running ahead of ours before a timestamp is treated as unreliable. */
const FUTURE_SKEW_MS = 5 * 60_000;

/**
 * When a quote's value was last true. Bare dates on US stocks and indices mean the regular close of that
 * day (4:00 PM, or 1:00 PM on early-close days) once it has passed; other bare dates stay date-only. Timestamps more
 * than 5 minutes in the future are unreliable (CNBC futures do this) and return null.
 */
export function quoteStamp(q: SessionQuote, now: Date): QuoteStamp | null {
  if (!q.time) return null;
  if (HAS_CLOCK_TIME.test(q.time)) {
    const t = Date.parse(q.time);
    if (!Number.isFinite(t) || t - now.getTime() > FUTURE_SKEW_MS) return null;
    const at = new Date(t);
    return { at, dateKey: nyParts(at).dateKey };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.time)) return null;
  const cls = classifyInstrument(q);
  if (cls === "us-equity" || cls === "us-index") {
    const close = nyDateTime(q.time, regularCloseMinutes(q.time));
    // During that day's session the close has not happened yet: keep the date, never invent a time.
    return { at: close.getTime() > now.getTime() ? null : close, dateKey: q.time };
  }
  return { at: null, dateKey: q.time };
}

/** Provenance for a quote's main price at `at` (CNBC, or Naver for Korean shares). */
export function quoteProvenance(q: SessionQuote & { delayed?: boolean; source?: "naver" }, at: Date): Provenance {
  const stamp = quoteStamp(q, at);
  return {
    source: q.source ?? "cnbc",
    asOf: stamp?.at ? stamp.at.toISOString() : stamp?.dateKey ?? "",
    session: instrumentSession(q, at),
    delayed: q.delayed,
  };
}
