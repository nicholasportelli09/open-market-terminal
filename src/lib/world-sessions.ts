/**
 * Regular trading hours of the non-US indices on the Europe and Asia tabs, in exchange-local time.
 * Weekdays only; exchange holidays are not modelled (a holiday shows up as a stale feed date instead).
 * Sources: exchange websites (Xetra, LSE, Euronext, SIX, JPX, HKEX, SSE, KRX, NSE), checked 2026-11-21.
 */

type Range = readonly [open: number, close: number];
type ExchangeHours = { timeZone: string; ranges: readonly Range[] };

const h = (hh: number, mm = 0) => hh * 60 + mm;
const EU_CASH: Range = [h(9), h(17, 30)];

/** Keyed by CNBC symbol. Lunch breaks (Shanghai, Hong Kong) split the day into two ranges. */
export const INDEX_HOURS: Record<string, ExchangeHours> = {
  ".STOXX": { timeZone: "Europe/Berlin", ranges: [EU_CASH] },
  ".GDAXI": { timeZone: "Europe/Berlin", ranges: [EU_CASH] },
  ".FCHI": { timeZone: "Europe/Paris", ranges: [EU_CASH] },
  ".SSMI": { timeZone: "Europe/Zurich", ranges: [EU_CASH] },
  ".FTSE": { timeZone: "Europe/London", ranges: [[h(8), h(16, 30)]] },
  ".N225": { timeZone: "Asia/Tokyo", ranges: [[h(9), h(15, 30)]] },
  ".HSI": { timeZone: "Asia/Hong_Kong", ranges: [[h(9, 30), h(12)], [h(13), h(16)]] },
  ".SSEC": { timeZone: "Asia/Shanghai", ranges: [[h(9, 30), h(11, 30)], [h(13), h(15)]] },
  ".KS11": { timeZone: "Asia/Seoul", ranges: [[h(9), h(15, 30)]] },
  ".NSEI": { timeZone: "Asia/Kolkata", ranges: [[h(9, 15), h(15, 30)]] },
};

type LocalParts = { dateKey: string; weekday: number; minutes: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formatters = new Map<string, Intl.DateTimeFormat>();

function localParts(at: Date, timeZone: string): LocalParts {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  const get: Record<string, string> = {};
  for (const p of f.formatToParts(at)) get[p.type] = p.value;
  return {
    dateKey: `${get.year}-${get.month}-${get.day}`,
    weekday: WEEKDAYS.indexOf(get.weekday),
    minutes: (+get.hour % 24) * 60 + +get.minute,
  };
}

/**
 * Whether a listed non-US index is in its regular session at `at`, or undefined when the symbol has no
 * hours table. Inside hours, a bare-date `time` counts only when it is today's local date (CNBC sends
 * bare dates for these indices); a holiday leaves the previous day's date and so reads closed.
 */
export function listedIndexOpen(symbol: string, time: string | null, at: Date): boolean | undefined {
  const hours = INDEX_HOURS[symbol];
  if (!hours) return undefined;
  const p = localParts(at, hours.timeZone);
  if (p.weekday === 0 || p.weekday === 6) return false;
  if (!hours.ranges.some(([open, close]) => p.minutes >= open && p.minutes < close)) return false;
  if (time && /^\d{4}-\d{2}-\d{2}$/.test(time)) return time === p.dateKey;
  return undefined;
}

/** Korean trading day in Seoul time: Nextrade pre-market, the KRX regular session, Nextrade after-hours. */
const KR_PRE = h(8);
const KR_OPEN = h(9);
const KR_CLOSE = h(15, 30);
const KR_POST_END = h(20);

/**
 * Session of a Korean listing at `at`, from Naver's own state (`status`: CLOSED, PRE, REGULAR or POST; see
 * naver.ts krMarketStatus), so holidays and halts read closed. The Seoul clock is a guard against a stale
 * reply: outside 08:00-20:00 on a weekday, or at weekends, it is closed whatever the feed said.
 */
export function krxSession(status: string | undefined, at: Date): "pre" | "regular" | "post" | "closed" {
  const p = localParts(at, "Asia/Seoul");
  if (p.weekday === 0 || p.weekday === 6 || p.minutes < KR_PRE || p.minutes >= KR_POST_END) return "closed";
  if (status === "PRE") return p.minutes < KR_OPEN ? "pre" : "regular";
  if (status === "REGULAR") return p.minutes >= KR_OPEN && p.minutes < KR_CLOSE ? "regular" : "closed";
  if (status === "POST") return p.minutes >= KR_CLOSE ? "post" : "regular";
  return "closed";
}
