"use client";

import Link from "next/link";
import { SessionMark } from "@/components/ui/source-tag";
import { fmtNumber } from "@/lib/format";
import { quoteHref } from "@/lib/instruments";
import { FACTORS } from "@/lib/scanner/factors";
import { METRIC_LABEL, fmtMetric } from "@/lib/scanner/labels";
import { KEY_METRICS, defaultDir, type Sort, type SortKey, type ViewRow } from "@/lib/scanner/view";
import { CompositeCell, FactorBar } from "./factor-bar";

type ScreenTableProps = { rows: ViewRow[]; sort: Sort; onSort: (s: Sort) => void; onOpen: (symbol: string) => void; selected: string | null };

const SHORT_METRIC: Record<(typeof KEY_METRICS)[number], string> = { pe: "P/E", fcfYield: "FCF yld", revenueGrowthTTM: "Rev gr.", volatility1y: "Vol 1y" };

type Col = { key: SortKey; label: string; title?: string; align?: "left" | "right" };

const COLS: Col[] = [
  { key: "rank", label: "#", title: "Rank by composite score" },
  { key: "symbol", label: "Company" },
  { key: "sector", label: "Sector (SIC)" },
  { key: "price", label: "Price", align: "right" },
  { key: "marketCap", label: "Mkt cap", align: "right" },
  { key: "composite", label: "Score", title: "Composite score (0-100, your weights)", align: "right" },
  ...FACTORS.map((f): Col => ({ key: f.id, label: f.short, title: `${f.label} score (percentile)` })),
  ...KEY_METRICS.map((k): Col => ({ key: k, label: SHORT_METRIC[k], title: METRIC_LABEL[k], align: "right" })),
];

function Header({ col, sort, onSort }: { col: Col; sort: Sort; onSort: (s: Sort) => void }) {
  const active = sort.key === col.key;
  const next: Sort = active ? { key: col.key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: defaultDir(col.key) };
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-2 py-2 font-medium first:pl-4 ${col.align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(next)} aria-label={`Sort by ${col.title ?? col.label}`} title={`Sort by ${col.title ?? col.label}`} className={`cursor-pointer rounded hover:text-fg ${active ? "text-fg" : ""}`}>
        {col.label}
        <span aria-hidden className="ml-0.5 inline-block w-2 text-[10px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

export function ScreenTable({ rows, sort, onSort, onOpen, selected }: ScreenTableProps) {
  return (
    <div className="relative max-w-full overflow-x-auto">
      <table className="w-full min-w-[1120px] border-collapse text-[13px]">
        <thead className="border-b border-line text-[11.5px] uppercase tracking-[0.04em] text-muted">
          <tr>
            {COLS.map((c) => (
              <Header key={c.key} col={c} sort={sort} onSort={onSort} />
            ))}
            <th scope="col" className="px-2 py-2 pr-4 text-right font-medium">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const r = v.row;
            const comp = v.scored.composite;
            const p = r.price.provenance;
            return (
              <tr
                key={r.symbol}
                onClick={() => onOpen(r.symbol)}
                className={`cursor-pointer border-b border-line last:border-0 hover:bg-hover ${selected === r.symbol ? "bg-hover" : ""}`}
              >
                <td className="num px-2 py-2 pl-4 text-muted">{v.rank ?? "—"}</td>
                <td className="max-w-[200px] px-2 py-2">
                  <Link href={quoteHref(r.symbol)} onClick={(e) => e.stopPropagation()} className="num font-semibold hover:underline">
                    {r.symbol}
                  </Link>
                  {r.extra && <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-faint">added</span>}
                  <span className="block truncate text-[12px] text-muted">{r.name}</span>
                </td>
                <td className="max-w-[128px] truncate px-2 py-2 text-[12px] text-muted" title={r.sicDescription ? `SIC ${r.sic}: ${r.sicDescription}` : undefined}>
                  {r.sector}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <span className="num">{fmtNumber(r.price.value, 2)}</span>
                  {p.session && <SessionMark session={p.session} delayed={p.delayed} className="block" />}
                </td>
                <td className="num whitespace-nowrap px-2 py-2 text-right">{fmtMetric(r.metrics.marketCap, r.currency)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <CompositeCell value={comp.ok ? comp.value : null} reason={comp.ok ? undefined : comp.reason} />
                </td>
                {FACTORS.map((f) => (
                  <td key={f.id} className="px-1.5 py-2">
                    <FactorBar label={f.label} score={v.scored.factors[f.id].score} />
                  </td>
                ))}
                {KEY_METRICS.map((k) => (
                  <td key={k} className="num whitespace-nowrap px-2 py-2 text-right" title={r.metrics[k].value === null ? r.metrics[k].reason : r.metrics[k].formula}>
                    {fmtMetric(r.metrics[k], r.currency, k)}
                  </td>
                ))}
                <td className="px-2 py-2 pr-4 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(r.symbol);
                    }}
                    aria-label={`Details for ${r.symbol}`}
                    className="inline-flex h-7 cursor-pointer items-center rounded-md border border-line px-2 text-[12px] font-medium text-muted hover:bg-card hover:text-fg"
                  >
                    Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
