export function fmtNumber(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPrice(n: number | null | undefined, decimals: number, isYield = false): string {
  const s = fmtNumber(n, Math.min(Math.max(decimals, 0), 6));
  return isYield && s !== "—" ? `${s}%` : s;
}

export function fmtSigned(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = fmtNumber(Math.abs(n), decimals);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function fmtPct(n: number | null | undefined, decimals = 2): string {
  const s = fmtSigned(n, decimals);
  return s === "—" ? s : `${s}%`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function direction(n: number | null | undefined): "up" | "down" | "flat" {
  if (!n) return "flat";
  return n > 0 ? "up" : "down";
}

export function timeAgo(iso: string, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

/** A yield change given in percentage points, as basis points: -0.102 -> "−10.2 bp". */
export function fmtBp(points: number | null | undefined): string {
  if (points === null || points === undefined || !Number.isFinite(points)) return "—";
  const bp = Math.round(points * 1000) / 10;
  return `${fmtSigned(bp, Number.isInteger(bp) ? 0 : 1)} bp`;
}

/** The change of a quote: basis points for yields, signed price otherwise. */
export function fmtChange(change: number | null | undefined, decimals: number, isYield = false): string {
  return isYield ? fmtBp(change) : fmtSigned(change, decimals);
}

const NY_TZ = "America/New_York";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "Fri, Nov 20, 4:00 PM ET" (New York time). */
export function fmtNyStamp(at: Date, withWeekday = true): string {
  const s = at.toLocaleString("en-US", {
    timeZone: NY_TZ,
    weekday: withWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${s} ET`;
}

/** "4:00 PM ET" (New York time). */
export function fmtNyTime(at: Date): string {
  return `${at.toLocaleTimeString("en-US", { timeZone: NY_TZ, hour: "numeric", minute: "2-digit" })} ET`;
}

/** "Fri, Nov 20" for a YYYY-MM-DD calendar date (no time zone shift); "Nov 20, 2026" with the year. */
export function fmtDateKey(dateKey: string, withYear = false): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: withYear ? undefined : "short",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
}

/** Provenance as-of for display: "Sep 27, 2026" for dates, "Nov 20, 2026, 4:59 PM ET" for instants. */
export function fmtAsOf(asOf: string): string {
  if (!asOf) return "";
  if (DATE_ONLY.test(asOf)) return fmtDateKey(asOf, true);
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return asOf;
  const s = new Date(t).toLocaleString("en-US", {
    timeZone: NY_TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  return `${s} ET`;
}

/** "Opens 9:30 AM ET" later today, "Opens Mon 9:30 AM ET" on another day. */
export function fmtOpensAt(opensAt: Date, now: Date): string {
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: NY_TZ });
  const time = opensAt.toLocaleTimeString("en-US", { timeZone: NY_TZ, hour: "numeric", minute: "2-digit" });
  if (day(opensAt) === day(now)) return `Opens ${time} ET`;
  const weekday = opensAt.toLocaleDateString("en-US", { timeZone: NY_TZ, weekday: "short" });
  return `Opens ${weekday} ${time} ET`;
}
