"use client";

import { useState } from "react";
import type { AllocationSlice, PortfolioValuation } from "@/lib/portfolio";
import { Panel, Segmented } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { fmtMoney, fmtShare } from "./money";
import { PartialChip } from "./ui-bits";

type View = "position" | "type" | "currency";

const VIEWS = [
  { id: "position", label: "Position" },
  { id: "type", label: "Asset type" },
  { id: "currency", label: "Currency" },
] as const;

const TYPE_NAME: Record<string, string> = { stock: "Stocks", etf: "ETFs", fund: "Funds", crypto: "Crypto", other: "Other", cash: "Cash" };

function Bars({ slices, base, label }: { slices: (AllocationSlice & { name: string })[]; base: string; label: string }) {
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {slices.map((s) => {
        const width = s.pct !== null ? Math.max(0, Math.min(1, s.pct)) * 100 : 0;
        return (
          <li key={s.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-medium">{s.name}</span>
              <span className="num shrink-0 text-muted">
                {fmtMoney(s.valueBase, base)} <span className="ml-1.5 font-semibold text-fg">{fmtShare(s.pct)}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden>
              <div className="h-full rounded-full bg-fg/70" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">{label}</div>
      <div className="num mt-0.5 text-[16px] font-semibold">{value}</div>
      {sub && <div className="truncate text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

/** Allocation by position / asset type / currency, plus invested vs cash, currency exposure and concentration. */
export function AllocationPanel({ valuation: v }: { valuation: PortfolioValuation }) {
  const [view, setView] = useState<View>("position");
  const base = v.baseCurrency;
  const t = v.totals;
  const total = t.totalValueBase;
  const partial = !t.complete ? `Shares of the valued part only; missing: ${[...v.missing.prices, ...v.missing.fx].join(", ")}` : undefined;

  if (total <= 0) {
    return (
      <Panel title="Allocation">
        <EmptyState title="Nothing to allocate yet" body="Allocation appears once the portfolio has a positive value." />
      </Panel>
    );
  }

  const cashSlice = t.cashBase !== 0 ? [{ key: "__cash", name: "Cash", valueBase: t.cashBase, pct: t.cashBase / total }] : [];
  const slices =
    view === "position"
      ? [...v.allocation.byPosition.map((s) => ({ ...s, name: s.key })), ...cashSlice]
      : view === "type"
        ? v.allocation.byAssetType.map((s) => ({ ...s, name: TYPE_NAME[s.key] ?? s.key }))
        : v.allocation.byCurrency.map((s) => ({ ...s, name: s.key }));
  const largest = v.positions.reduce<(typeof v.positions)[number] | null>((m, p) => (!m || p.marketValueBase > m.marketValueBase ? p : m), null);
  const foreign = v.exposure.currencyExposure.filter((c) => c.currency !== base).reduce((s, c) => s + (c.pct ?? 0), 0);

  return (
    <Panel title="Allocation" action={partial ? <PartialChip title={partial} /> : undefined} bodyClassName="space-y-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Invested" value={fmtShare(v.exposure.grossInvestedPct)} sub={fmtMoney(t.marketValueBase, base)} />
        <Stat label="Cash" value={fmtShare(v.exposure.cashPct)} sub={fmtMoney(t.cashBase, base)} />
        <Stat label="Largest position" value={largest ? fmtShare(largest.weight) : "—"} sub={largest ? largest.symbol : "No holdings"} />
        <Stat label={`Outside ${base}`} value={fmtShare(foreign)} sub="Currency exposure" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-faint">Share of total value ({fmtMoney(total, base)})</span>
        <Segmented options={VIEWS} value={view} onChange={setView} label="Allocation view" />
      </div>
      <Bars slices={slices} base={base} label={`Allocation by ${view}`} />
      {view === "currency" && <p className="text-[12px] text-faint">Currency exposure counts holdings in their trading currency plus cash in each currency.</p>}
    </Panel>
  );
}
