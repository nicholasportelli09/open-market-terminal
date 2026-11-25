"use client";

import { useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import { fmtCompact } from "@/lib/format";
import type { Fundamentals, Statement } from "@/lib/types";
import { Panel, Segmented } from "@/components/ui/panel";

const PERIODS = [
  { id: "annual", label: "Annual" },
  { id: "quarterly", label: "Quarterly" },
] as const;
type Period = (typeof PERIODS)[number]["id"];
const COLLAPSED_ROWS = 10;
/** Nasdaq reports statement values in thousands of dollars. */
const UNIT = 1_000;

/** "$478,834,000" -> "$478.83B"; "-$1,234" or "($1,234)" -> "−$1.23M"; ratios "102.31998%" -> "102.32%". */
function formatCell(raw: string, statement: Statement["id"]): string {
  if (!/\d/.test(raw)) return "—";
  if (raw.endsWith("%")) {
    const n = Number(raw.replace(/[%,]/g, ""));
    return Number.isFinite(n) ? `${n.toFixed(2)}%` : raw;
  }
  const negative = raw.startsWith("-") || raw.startsWith("(");
  const n = Number(raw.replace(/[-$,()\s]/g, ""));
  if (!Number.isFinite(n)) return raw;
  const value = statement === "ratios" ? n : n * UNIT;
  const body = statement === "ratios" ? n.toFixed(2) : `$${fmtCompact(value)}`;
  return negative ? `−${body}` : body;
}

function periodLabel(p: string): string {
  const d = new Date(p);
  return Number.isNaN(d.getTime()) ? p : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Income statement, balance sheet, cash flow and ratios (OpenBB's fundamentals view, simplified). */
export function Financials({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState<Period>("annual");
  const [tab, setTab] = useState<Statement["id"]>("income");
  const [expanded, setExpanded] = useState(false);
  const { data, error, loading } = useFetch<Fundamentals>(
    `/api/fundamentals?symbol=${encodeURIComponent(symbol)}${period === "quarterly" ? "&period=quarterly" : ""}`,
  );
  const statements = data?.statements ?? [];
  if (!loading && !error && statements.length === 0) return null;
  const st = statements.find((s) => s.id === tab) ?? statements[0];
  const rows = st ? (expanded ? st.rows : st.rows.slice(0, COLLAPSED_ROWS)) : [];

  return (
    <Panel title="Financials" action={<Segmented label="Reporting period" options={PERIODS} value={period} onChange={setPeriod} />}>
      <div className="border-b border-line px-3 py-2">
        <Segmented
          label="Statement"
          options={statements.length ? statements.map((s) => ({ id: s.id, label: s.label })) : [{ id: "income" as const, label: "Income" }]}
          value={st?.id ?? "income"}
          onChange={(id) => {
            setTab(id);
            setExpanded(false);
          }}
        />
      </div>
      {!st && (error ? <p className="px-4 py-6 text-center text-[13px] text-muted">Financials are unavailable right now.</p> : <div className="skeleton m-4 h-40" />)}
      {st && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.06em] text-faint">
                  <th scope="col" className="sticky left-0 bg-card px-4 py-2 text-left font-medium">{st.id === "ratios" ? "Ratio" : "USD"}</th>
                  {st.periods.map((p) => (
                    <th key={p} scope="col" className="num px-4 py-2 text-right font-medium">{periodLabel(p)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) =>
                  r.section ? (
                    <tr key={`${r.label}-${i}`} className="border-b border-line">
                      <th scope="colgroup" colSpan={st.periods.length + 1} className="sticky left-0 bg-card px-4 pb-1 pt-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">{r.label}</th>
                    </tr>
                  ) : (
                    <tr key={`${r.label}-${i}`} className="border-b border-line last:border-0 hover:bg-hover">
                      <th scope="row" className="sticky left-0 max-w-[220px] bg-card px-4 py-2 text-left font-normal text-muted">{r.label}</th>
                      {r.values.map((v, j) => (
                        <td key={j} className={`num px-4 py-2 text-right ${j === 0 ? "font-medium text-fg" : "text-muted"}`}>{formatCell(v, st.id)}</td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {st.rows.length > COLLAPSED_ROWS && (
            <button type="button" onClick={() => setExpanded((x) => !x)} className="w-full cursor-pointer border-t border-line py-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">
              {expanded ? "Show fewer rows" : `Show all ${st.rows.length} rows`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
