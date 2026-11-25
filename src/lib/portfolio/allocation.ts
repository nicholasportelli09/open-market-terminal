/**
 * Allocation slices as a share of total value (positions + cash). Cash is its own asset-type
 * bucket ("cash") and adds to its currency's exposure. Percentages are null when the total is not
 * positive, because a share of zero or of a negative total means nothing.
 */
import { EPSILON } from "./order";
import type { AllocationSlice, CashValuation, PositionValuation } from "./valuation-types";

function slices(groups: Map<string, number>, total: number): AllocationSlice[] {
  return [...groups.entries()]
    .map(([key, valueBase]) => ({ key, valueBase, pct: total > EPSILON ? valueBase / total : null }))
    .sort((a, b) => b.valueBase - a.valueBase);
}

function add(groups: Map<string, number>, key: string, value: number): void {
  groups.set(key, (groups.get(key) ?? 0) + value);
}

export function buildAllocation(
  positions: readonly Pick<PositionValuation, "symbol" | "assetType" | "currency" | "marketValueBase">[],
  cash: readonly CashValuation[],
  totalValueBase: number,
): { byPosition: AllocationSlice[]; byAssetType: AllocationSlice[]; byCurrency: AllocationSlice[] } {
  const bySymbol = new Map<string, number>();
  const byType = new Map<string, number>();
  const byCurrency = new Map<string, number>();
  for (const p of positions) {
    add(bySymbol, p.symbol, p.marketValueBase);
    add(byType, p.assetType, p.marketValueBase);
    add(byCurrency, p.currency, p.marketValueBase);
  }
  for (const c of cash) {
    add(byType, "cash", c.amountBase);
    add(byCurrency, c.currency, c.amountBase);
  }
  return {
    byPosition: slices(bySymbol, totalValueBase),
    byAssetType: slices(byType, totalValueBase),
    byCurrency: slices(byCurrency, totalValueBase),
  };
}
