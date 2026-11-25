import type { Transaction } from "./types";

/**
 * Processing order for the ledger: by date, then by createdAt (so two trades on one day run in the
 * order they were entered), then by original position. Returns a new array; the input is untouched.
 */
export function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => {
      if (a.tx.date !== b.tx.date) return a.tx.date < b.tx.date ? -1 : 1;
      if (a.tx.createdAt !== b.tx.createdAt) return a.tx.createdAt < b.tx.createdAt ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.tx);
}

/** Today's date as YYYY-MM-DD in the device's local time zone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD), computed in UTC so DST never shifts it. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Tolerance for floating-point quantity and cash comparisons. */
export const EPSILON = 1e-9;
