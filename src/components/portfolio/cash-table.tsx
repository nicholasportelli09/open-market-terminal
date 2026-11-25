"use client";

import type { CashValuation, PortfolioValuation } from "@/lib/portfolio";
import { Panel } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { EmptyState } from "@/components/ui/states";
import { fmtMoney, fmtRate, fmtShare, sortRows, toneClass } from "./money";
import { SortHeader, useSort } from "./sort-header";
import { Note } from "./ui-bits";

type Key = "currency" | "amount" | "rate" | "base";

const KEY: Record<Key, (c: CashValuation) => number | string | null | undefined> = {
  currency: (c) => c.currency,
  amount: (c) => c.amount,
  rate: (c) => c.fx?.rateToBase,
  base: (c) => c.amountBase,
};

const td = "whitespace-nowrap px-3 py-2.5 text-right num";

export function CashTable({ valuation: v }: { valuation: PortfolioValuation }) {
  const { sort, toggle } = useSort<Key>({ key: "base", dir: "desc" }, ["currency"]);
  const base = v.baseCurrency;
  const rows = sortRows(v.cash, KEY[sort.key], sort.dir);
  const total = v.totals.totalValueBase;
  const missingFx = v.missing.fx.filter((c) => !v.cash.some((x) => x.currency === c));

  if (v.cash.length === 0 && missingFx.length === 0) {
    return (
      <Panel title="Cash">
        <EmptyState title="No cash balances" body="Use Add cash to record a deposit." />
      </Panel>
    );
  }
  return (
    <Panel title="Cash">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-[13px]">
          <thead className="border-b border-line text-[11px] text-faint">
            <tr>
              <SortHeader label="Currency" k="currency" sort={sort} onSort={toggle} align="left" />
              <SortHeader label="Balance" k="amount" sort={sort} onSort={toggle} />
              <SortHeader label={`Rate to ${base}`} k="rate" sort={sort} onSort={toggle} />
              <SortHeader label={`Value ${base}`} k="base" sort={sort} onSort={toggle} />
              <th scope="col" className="px-3 py-2 text-right font-medium uppercase tracking-[0.05em]">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.currency}>
                <td className="px-3 py-2.5 font-semibold">{c.currency}</td>
                <td className={`${td} ${c.amount < 0 ? toneClass(c.amount) : ""}`}>{fmtMoney(c.amount, c.currency)}</td>
                <td className={td}>
                  {c.currency === base ? "1" : fmtRate(c.fx?.rateToBase)}
                  {c.fx && (
                    <div className="font-sans">
                      <SourceTag provenance={{ source: c.fx.source, asOf: c.fx.asOf, session: "continuous" }} />
                    </div>
                  )}
                </td>
                <td className={td}>{fmtMoney(c.amountBase, base)}</td>
                <td className={td}>{total > 0 ? fmtShare(c.amountBase / total) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missingFx.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <Note tone="warn">No live FX rate to {base} for {missingFx.join(", ")}; anything held in {missingFx.length === 1 ? "it" : "them"} is left out of the totals.</Note>
        </div>
      )}
    </Panel>
  );
}
