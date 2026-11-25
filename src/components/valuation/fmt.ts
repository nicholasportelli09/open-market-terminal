import { fmtCompact, fmtNumber, fmtPct } from "@/lib/format";

/** Display helpers for the Valuation Lab. Rates are decimals in, percent text out. */

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

function sign(v: number): string {
  return v < 0 ? "−" : "";
}

/** "$478.83B", "−$23.4B"; other currencies as "478.83B TWD". */
export function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const body = fmtCompact(Math.abs(v));
  const sym = SYMBOLS[currency];
  return sym ? `${sign(v)}${sym}${body}` : `${sign(v)}${body} ${currency}`;
}

/** "$212.34" per share. */
export function fmtPerShare(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const body = fmtNumber(Math.abs(v), 2);
  const sym = SYMBOLS[currency];
  return sym ? `${sign(v)}${sym}${body}` : `${sign(v)}${body} ${currency}`;
}

/** 0.0873 -> "8.7%". */
export function fmtRate(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${fmtNumber(v * 100, decimals)}%`;
}

/** 0.12 -> "+12.0%". */
export function fmtSignedRate(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return fmtPct(v * 100, decimals);
}

export function fmtMultiple(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${fmtNumber(v, 1)}x`;
}

export function toneClass(v: number | null | undefined): string {
  if (!v) return "text-muted";
  return v > 0 ? "text-up" : "text-down";
}
