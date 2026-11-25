"use client";

import { useMemo, useState } from "react";
import { ACTION_LABEL, RATING_KEYS, RATING_LABEL, type AnalystHistory, type AnalystRatingRow, type RatingAction } from "@/lib/analyst-types";
import { fmtDateKey, fmtPct, fmtPrice } from "@/lib/format";
import { Segmented } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { DEFAULT_FILTER, DEFAULT_SORT, filterRows, nextSort, rowUpside, sortRows, WINDOWS, type HistoryFilter, type HistorySort, type SortKey } from "./history-filter";
import { ratingTone, SourcesFooter } from "./section-state";

const PAGE = 20;
const ACTIONS: RatingAction[] = ["upgrade", "downgrade", "maintain", "initiate", "reiterate", "target", "other"];
const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "analyst", label: "Analyst", align: "left" },
  { key: "firm", label: "Firm", align: "left" },
  { key: "action", label: "Action", align: "left" },
  { key: "rating", label: "Rating", align: "left" },
  { key: "target", label: "Price target", align: "right" },
  { key: "upside", label: "Upside", align: "right" },
  { key: "date", label: "Date", align: "right" },
];
const field = "h-8 rounded-lg border border-line bg-card px-2.5 text-[12.5px] text-fg outline-none focus-visible:border-fg";

function Rating({ r }: { r: AnalystRatingRow }) {
  if (!r.ratingNew) return <span className="text-faint">—</span>;
  const changed = r.ratingOld && r.ratingOld.toLowerCase() !== r.ratingNew.toLowerCase();
  return (
    <span className="whitespace-nowrap">
      {changed && <span className="text-faint">{r.ratingOld} → </span>}
      <span className={`font-medium ${ratingTone(r.ratingKey)}`}>{r.ratingNew}</span>
    </span>
  );
}

function Target({ r, decimals }: { r: AnalystRatingRow; decimals: number }) {
  if (r.targetNew == null) return <span className="text-faint">—</span>;
  const dir = r.targetOld == null ? "" : r.targetNew > r.targetOld ? "text-up" : r.targetNew < r.targetOld ? "text-down" : "";
  return (
    <span className="whitespace-nowrap">
      {r.targetOld != null && <span className="text-faint">{fmtPrice(r.targetOld, decimals)} → </span>}
      <span className={`font-medium ${dir}`}>{fmtPrice(r.targetNew, decimals)}</span>
    </span>
  );
}

type HistoryProps = { history: AnalystHistory; price: number | null; decimals: number };

/** Analyst ratings history with column sorting and filters (action, rating, firm or analyst search, time window). */
export function RatingsHistory({ history, price, decimals }: HistoryProps) {
  const [filter, setFilter] = useState<HistoryFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<HistorySort>(DEFAULT_SORT);
  const [shown, setShown] = useState(PAGE);
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => sortRows(filterRows(history.rows, filter, today), sort, price), [history.rows, filter, today, sort, price]);
  const set = (patch: Partial<HistoryFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setShown(PAGE);
  };
  const filtered = filter.action !== "all" || filter.rating !== "all" || filter.firm.trim() !== "" || filter.window !== DEFAULT_FILTER.window;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <label className="min-w-0 flex-1 basis-44">
          <span className="sr-only">Search firm or analyst</span>
          <input type="search" value={filter.firm} onChange={(e) => set({ firm: e.target.value })} placeholder="Search firm or analyst" className={`${field} w-full`} />
        </label>
        <label>
          <span className="sr-only">Action</span>
          <select value={filter.action} onChange={(e) => set({ action: e.target.value as HistoryFilter["action"] })} className={`${field} cursor-pointer`}>
            <option value="all">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Rating</span>
          <select value={filter.rating} onChange={(e) => set({ rating: e.target.value as HistoryFilter["rating"] })} className={`${field} cursor-pointer`}>
            <option value="all">All ratings</option>
            {RATING_KEYS.map((k) => (
              <option key={k} value={k}>{RATING_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <Segmented label="Time window" options={WINDOWS} value={filter.window} onChange={(w) => set({ window: w })} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No ratings match these filters" : "No rating changes on record"}
          action={filtered ? <button type="button" onClick={() => { setFilter(DEFAULT_FILTER); setShown(PAGE); }} className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">Clear filters</button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <caption className="sr-only">Analyst ratings history, {rows.length} rows. Column headers sort the table.</caption>
            <thead>
              <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.06em] text-faint">
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-3 py-2 font-medium first:pl-4 last:pr-4 ${c.align === "right" ? "text-right" : "text-left"}`}>
                      <button type="button" onClick={() => setSort((s) => nextSort(s, c.key))} className={`inline-flex cursor-pointer items-center gap-1 uppercase tracking-[0.06em] hover:text-fg ${active ? "text-fg" : ""}`}>
                        {c.label}
                        <span aria-hidden className={active ? "" : "opacity-0"}>{active && sort.dir === "asc" ? "↑" : "↓"}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((r) => {
                const up = rowUpside(r, price);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-hover">
                    <td className="whitespace-nowrap px-3 py-2 pl-4 text-muted">{r.analyst ?? <span className="text-faint">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{r.firm}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{ACTION_LABEL[r.action]}</td>
                    <td className="px-3 py-2"><Rating r={r} /></td>
                    <td className="num px-3 py-2 text-right"><Target r={r} decimals={decimals} /></td>
                    <td className={`num px-3 py-2 text-right ${up == null ? "text-faint" : up >= 0 ? "text-up" : "text-down"}`}>{fmtPct(up, 1)}</td>
                    <td className="num whitespace-nowrap px-3 py-2 pr-4 text-right text-muted">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" title={`Read the note${r.publisher ? ` (${r.publisher})` : ""}`} className="underline decoration-line underline-offset-2 hover:text-fg">
                          {fmtDateKey(r.date, true)}
                        </a>
                      ) : (
                        fmtDateKey(r.date, true)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE * 2)} className="w-full cursor-pointer border-t border-line py-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">
          Show more ({rows.length - shown} more)
        </button>
      )}
      <div className="border-t border-line">
        <SourcesFooter list={[history.provenance]}>
          <span className="text-[11.5px] text-faint">Upside is the new target vs the current price.</span>
        </SourcesFooter>
      </div>
    </>
  );
}
