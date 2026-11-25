/** Display helpers for portfolio money, rates and sorting. Pure. */
import { fmtNumber, fmtSigned } from "@/lib/format";

export const BASE_CURRENCIES = ["USD", "EUR", "CHF", "GBP", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "HKD", "SGD", "NZD"] as const;

const ZERO_DECIMALS = new Set(["JPY", "KRW"]);

export function moneyDecimals(currency: string): number {
  return ZERO_DECIMALS.has(currency) ? 0 : 2;
}

/** "1,234.56 CHF"; "—" when missing. */
export function fmtMoney(value: number | null | undefined, currency: string): string {
  const s = fmtNumber(value, moneyDecimals(currency));
  return s === "—" ? s : `${s} ${currency}`;
}

/** "+1,234.56 CHF" / "−12.00 CHF". */
export function fmtSignedMoney(value: number | null | undefined, currency: string): string {
  const s = fmtSigned(value, moneyDecimals(currency));
  return s === "—" ? s : `${s} ${currency}`;
}

/** A share 0..1 as "12.3%". */
export function fmtShare(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** A fraction as a signed percent: 0.0123 -> "+1.23%". */
export function fmtReturn(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = fmtSigned(value * 100, decimals);
  return `${s}%`;
}

/** FX rates with enough precision for JPY-like and EUR-like pairs. */
export function fmtRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return fmtNumber(value, value >= 10 ? 4 : 6);
}

export function fmtQty(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function toneClass(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return "text-muted";
  return value > 0 ? "text-up" : "text-down";
}

export type SortDir = "asc" | "desc";

/** Rows sorted by a numeric or text key, missing values (null / undefined / NaN) always last. */
export function sortRows<T>(rows: readonly T[], key: (row: T) => number | string | null | undefined, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const missing = (v: number | string | null | undefined) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  return [...rows].sort((a, b) => {
    const va = key(a);
    const vb = key(b);
    if (missing(va) && missing(vb)) return 0;
    if (missing(va)) return 1;
    if (missing(vb)) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
    return String(va).localeCompare(String(vb)) * sign;
  });
}
