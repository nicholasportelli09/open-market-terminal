"use client";

import { FACTORS, type FactorId } from "@/lib/scanner/factors";
import type { Filters } from "@/lib/scanner/view";

type FiltersBarProps = { filters: Filters; sectors: string[]; onChange: (f: Filters) => void; shown: number; total: number };

const CAPS = [
  { v: 0, label: "Any size" },
  { v: 50e9, label: "$50B+" },
  { v: 100e9, label: "$100B+" },
  { v: 250e9, label: "$250B+" },
  { v: 500e9, label: "$500B+" },
  { v: 1e12, label: "$1T+" },
];
const MINS = [0, 25, 50, 75, 90];

const field = "h-8 rounded-lg border border-line bg-card px-2 text-[12.5px] text-fg";

export function FiltersBar({ filters, sectors, onChange, shown, total }: FiltersBarProps) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const active = filters.query || filters.sector !== "all" || filters.minMarketCap > 0 || filters.minScore > 0;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <label className="sr-only" htmlFor="scan-search">Search ticker or name</label>
      <input
        id="scan-search"
        type="search"
        value={filters.query}
        onChange={(e) => set("query", e.target.value)}
        placeholder="Search ticker or name"
        className={`${field} w-full min-w-0 sm:w-52`}
      />
      <label className="sr-only" htmlFor="scan-sector">Sector</label>
      <select id="scan-sector" value={filters.sector} onChange={(e) => set("sector", e.target.value)} className={`${field} min-w-0 max-w-[48%] sm:max-w-none`}>
        <option value="all">All sectors</option>
        {sectors.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="scan-cap">Minimum market cap</label>
      <select id="scan-cap" value={filters.minMarketCap} onChange={(e) => set("minMarketCap", Number(e.target.value))} className={field}>
        {CAPS.map((c) => (
          <option key={c.v} value={c.v}>{c.label}</option>
        ))}
      </select>
      <span className="inline-flex items-center gap-1">
        <label className="sr-only" htmlFor="scan-score-of">Score to filter on</label>
        <select id="scan-score-of" value={filters.scoreOf} onChange={(e) => set("scoreOf", e.target.value as FactorId | "composite")} className={field}>
          <option value="composite">Composite</option>
          {FACTORS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="scan-min">Minimum score</label>
        <select id="scan-min" value={filters.minScore} onChange={(e) => set("minScore", Number(e.target.value))} className={field}>
          {MINS.map((m) => (
            <option key={m} value={m}>{m === 0 ? "any score" : `${m}+`}</option>
          ))}
        </select>
      </span>
      <span className="num ml-auto text-[12px] text-faint" aria-live="polite">
        {shown} of {total}
      </span>
      {active && (
        <button
          type="button"
          onClick={() => onChange({ query: "", sector: "all", minMarketCap: 0, minScore: 0, scoreOf: filters.scoreOf })}
          className="inline-flex h-8 cursor-pointer items-center rounded-lg px-2 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
