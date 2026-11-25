/** Pure filter and sort logic for the analyst ratings history table (unit-tested). */
import { impliedUpside, type AnalystRatingRow, type RatingAction, type RatingKey } from "@/lib/analyst-types";
import { ratingScore } from "@/lib/server/analyst/ratings";

export const WINDOWS = [
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
] as const;
export type HistoryWindow = (typeof WINDOWS)[number]["id"];

const WINDOW_MONTHS: Record<HistoryWindow, number | null> = { "3m": 3, "6m": 6, "1y": 12, all: null };

export type HistoryFilter = { action: RatingAction | "all"; rating: RatingKey | "all"; firm: string; window: HistoryWindow };

export const DEFAULT_FILTER: HistoryFilter = { action: "all", rating: "all", firm: "", window: "1y" };

export type SortKey = "date" | "analyst" | "firm" | "action" | "rating" | "target" | "upside";
export type SortDir = "asc" | "desc";
export type HistorySort = { key: SortKey; dir: SortDir };

export const DEFAULT_SORT: HistorySort = { key: "date", dir: "desc" };

/** YYYY-MM-DD `months` calendar months before `today` (YYYY-MM-DD). */
export function monthsBefore(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1 - months, d));
  return at.toISOString().slice(0, 10);
}

export function filterRows(rows: readonly AnalystRatingRow[], f: HistoryFilter, today: string): AnalystRatingRow[] {
  const months = WINDOW_MONTHS[f.window];
  const from = months == null ? "" : monthsBefore(today, months);
  const q = f.firm.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.action === "all" || r.action === f.action) &&
      (f.rating === "all" || r.ratingKey === f.rating) &&
      (!from || r.date >= from) &&
      (!q || r.firm.toLowerCase().includes(q) || (r.analyst ?? "").toLowerCase().includes(q)),
  );
}

export function rowUpside(r: AnalystRatingRow, price: number | null): number | null {
  return impliedUpside(r.targetNew, price);
}

function sortValue(r: AnalystRatingRow, key: SortKey, price: number | null): string | number | null {
  switch (key) {
    case "date":
      return r.date;
    case "analyst":
      return r.analyst?.toLowerCase() ?? null;
    case "firm":
      return r.firm.toLowerCase();
    case "action":
      return r.action;
    case "rating":
      return ratingScore(r.ratingKey);
    case "target":
      return r.targetNew;
    case "upside":
      return rowUpside(r, price);
  }
}

/** Sorted copy. Rows without a value always sort last; ties fall back to newest first. */
export function sortRows(rows: readonly AnalystRatingRow[], sort: HistorySort, price: number | null): AnalystRatingRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key, price);
    const vb = sortValue(b, sort.key, price);
    if (va == null && vb == null) return b.date.localeCompare(a.date);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return c !== 0 ? c * sign : b.date.localeCompare(a.date);
  });
}

/** Header click: same column flips direction; a new column starts descending (ascending for text). */
export function nextSort(current: HistorySort, key: SortKey): HistorySort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  const textual = key === "analyst" || key === "firm" || key === "action";
  return { key, dir: textual ? "asc" : "desc" };
}
