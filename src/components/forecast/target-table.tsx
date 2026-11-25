import { impliedUpside, type AnalystTargets } from "@/lib/analyst-types";
import { fmtPct, fmtPrice } from "@/lib/format";

const ROWS: { key: "low" | "average" | "median" | "high"; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "average", label: "Average" },
  { key: "median", label: "Median" },
  { key: "high", label: "High" },
];

type TableProps = { targets: AnalystTargets; price: number | null; decimals: number };

/** Low / Average / Median / High 12-month targets with implied change from the current price. */
export function TargetTable({ targets, price, decimals }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <caption className="sr-only">12-month analyst price targets and implied change from the current price</caption>
        <thead>
          <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.06em] text-faint">
            <th scope="col" className="px-4 py-2 text-left font-medium">Target</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">vs current</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const v = targets[r.key];
            const up = impliedUpside(v, price);
            return (
              <tr key={r.key} className="border-b border-line last:border-0">
                <th scope="row" className={`px-4 py-2 text-left font-normal ${r.key === "average" ? "font-medium text-fg" : "text-muted"}`}>{r.label}</th>
                <td className="num px-4 py-2 text-right font-medium">{fmtPrice(v, decimals)}</td>
                <td className={`num px-4 py-2 text-right ${up == null ? "text-faint" : up >= 0 ? "text-up" : "text-down"}`}>{fmtPct(up, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
