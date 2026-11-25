"use client";

import type { CompanySnapshot } from "@/lib/company-types";
import { fmtDateKey } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { EmptyState } from "@/components/ui/states";
import { fmtMoney, fmtSignedRate, toneClass } from "./fmt";
import { revenueHistoryRows } from "./seed";

/** Annual revenue from 10-K / 20-F filings: compact bars plus a table with a filing link per year. */
export function RevenueHistory({ snapshot }: { snapshot: CompanySnapshot }) {
  const rows = revenueHistoryRows(snapshot);
  const cur = snapshot.currency;
  if (rows.length === 0) {
    return (
      <Panel title="Revenue history">
        <EmptyState title="No annual revenue in the filings" body="SEC XBRL data has no annual revenue for this company, so there is no history to show." />
      </Panel>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Panel title="Revenue history" action={<span className="text-[12px] text-faint">Annual, SEC filings</span>}>
      <div className="px-4 pt-4" aria-hidden>
        <div className="flex h-24 items-end gap-1.5">
          {rows.map((r) => (
            <div key={r.fiscalYear} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <div className="w-full max-w-10 rounded-t-[4px] bg-fg/15 dark:bg-fg/20" style={{ height: `${Math.max(4, (r.value / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {rows.map((r) => (
            <span key={r.fiscalYear} className="num min-w-0 flex-1 truncate text-center text-[10.5px] text-faint">
              {String(r.fiscalYear).slice(2)}
            </span>
          ))}
        </div>
      </div>
      <div className="relative mt-3 max-h-[260px] overflow-auto border-t border-line">
        <table className="w-full min-w-[420px] text-[13px]">
          <caption className="sr-only">Annual revenue by fiscal year</caption>
          <thead className="sticky top-0 bg-card text-[11.5px] text-faint">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">Fiscal year</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Revenue</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Growth</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.fiscalYear} className="border-t border-line">
                <td className="px-4 py-1.5">
                  <span className="num font-medium">FY{r.fiscalYear}</span>
                  <span className="ml-2 text-[11.5px] text-faint">to {fmtDateKey(r.periodEnd, true)}</span>
                </td>
                <td className="num px-2 py-1.5 text-right">{fmtMoney(r.value, cur)}</td>
                <td className={`num px-2 py-1.5 text-right ${toneClass(r.growth)}`}>{fmtSignedRate(r.growth)}</td>
                <td className="px-4 py-1.5">
                  <SourceTag provenance={{ ...r.provenance, note: r.provenance.note?.split(/, (?:us-gaap|ifrs-full):/)[0] }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
