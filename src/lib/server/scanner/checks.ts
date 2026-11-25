/**
 * Cross-checks of SEC-derived per-share figures against CNBC's published ones. The snapshot's TTM EPS is a sum
 * of quarterly XBRL values, which is wrong when quarters straddle a stock split (e.g. BKNG after its split):
 * P/E then comes out far too low. Rather than rank on a wrong number, the scanner drops it with the reason.
 */
import type { ScanMetric } from "@/lib/scanner/types";

/** Ratios outside [1/MAX_RATIO, MAX_RATIO] are treated as a data error, not a real difference in method. */
export const MAX_RATIO = 2;

/** "11.275B" / "4.978T" / "820M" / "15.63" -> number; null when unparseable. */
export function parseCnbcNumber(raw: string | undefined): number | null {
  const m = raw?.trim().replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/i);
  if (!m) return null;
  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B" | "T"] ?? 1;
  return Number(m[1]) * scale;
}

const disagree = (a: number, b: number) => a > 0 && b > 0 && (a / b > MAX_RATIO || b / a > MAX_RATIO);

export type CheckResult = { pe: ScanMetric; warning: string | null };

/**
 * Nulls the SEC-based P/E when CNBC's published P/E differs by more than 2x (both positive). Only P/E is
 * checked: it is the one figure built from summed per-share data.
 */
export function checkPe(pe: ScanMetric, cnbcPeRaw: string | undefined): CheckResult {
  const cnbc = parseCnbcNumber(cnbcPeRaw);
  if (pe.value === null || cnbc === null || !disagree(pe.value, cnbc)) return { pe, warning: null };
  const reason = `SEC-based P/E (${pe.value.toFixed(2)}) differs from CNBC's published P/E (${cnbc.toFixed(2)}) by more than ${MAX_RATIO}x, so P/E is left out pending a check (a stock split inside the TTM window or near-zero earnings can cause this)`;
  return { pe: { ...pe, value: null, reason }, warning: `${reason}.` };
}
