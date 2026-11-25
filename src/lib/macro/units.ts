import { fmtBp, fmtNumber, fmtPct, fmtSigned } from "@/lib/format";
import type { PeriodChange } from "./math";
import type { CardKind } from "./series";

/** A reading's level in its natural unit: "4.00%", "29 bp", "122.65", "+119k". */
export function fmtLevel(kind: CardKind, value: number, decimals?: number, signed = true): string {
  switch (kind) {
    case "rate":
      return `${fmtNumber(value, decimals ?? 2)}%`;
    case "pp":
      return `${fmtNumber(value, decimals ?? 1)}%`;
    case "yoy":
      return `${fmtNumber(value, decimals ?? 1)}%`;
    case "spread":
      return signed ? `${fmtSigned(Math.round(value * 100), 0)} bp` : `${fmtNumber(Math.round(value * 100), 0)} bp`;
    case "flow":
      return `${fmtSigned(value, decimals ?? 0)}k`;
    case "points":
      return fmtSigned(value, decimals ?? 3);
    default:
      return fmtNumber(value, decimals ?? 2);
  }
}

/** A change over a period in the right unit: bp for rates and spreads, % for prices, pp for rates of change. */
export function fmtPeriodChange(kind: CardKind, change: PeriodChange | null, decimals?: number): string {
  if (!change) return "—";
  switch (kind) {
    case "rate":
    case "spread":
      return fmtBp(change.diff);
    case "yoy":
    case "pp":
      return `${fmtSigned(change.diff, 1)} pp`;
    case "points":
      return fmtSigned(change.diff, decimals ?? 3);
    case "index":
      return `${fmtSigned(change.diff, decimals ?? 2)} pts`;
    case "flow":
      return `${fmtSigned(change.diff, 0)}k`;
    default:
      return fmtPct(change.pct);
  }
}

/** Unit word used in screen-reader / tooltip text for a change. */
export function changeUnit(kind: CardKind): string {
  if (kind === "rate" || kind === "spread") return "basis points";
  if (kind === "yoy" || kind === "pp") return "percentage points";
  if (kind === "level") return "percent";
  return "index points";
}
