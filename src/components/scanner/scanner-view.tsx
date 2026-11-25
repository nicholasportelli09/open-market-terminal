"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { SourceTags } from "@/components/ui/source-tag";
import { EmptyState, ErrorState, UnavailableState } from "@/components/ui/states";
import { useApi } from "@/lib/client/use-api";
import { fmtAsOf } from "@/lib/format";
import type { Weights } from "@/lib/scanner/factors";
import { deleteThesis, loadPrefs, loadTheses, savePrefs, saveThesis, type ScannerPrefs } from "@/lib/scanner/storage";
import type { ThesisResult } from "@/lib/scanner/thesis";
import type { ScreenData } from "@/lib/scanner/types";
import { DEFAULT_FILTERS, buildView, filterView, sectorsOf, sortView, type Filters, type Sort } from "@/lib/scanner/view";
import { ExtrasPanel } from "./extras-panel";
import { FiltersBar } from "./filters-bar";
import { RowDetail } from "./row-detail";
import { SavedTheses } from "./saved-theses";
import { ScreenProgress } from "./screen-progress";
import { ScreenTable } from "./screen-table";
import { WeightsPanel } from "./weights-panel";

type Selected = { symbol: string; thesis: ThesisResult | null };

const clearBtn = "mt-2 inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg";

function screenUrl(extras: string[]): string {
  return extras.length ? `/api/scanner?extra=${encodeURIComponent(extras.join(","))}` : "/api/scanner";
}

export function ScannerView() {
  const [prefs, setPrefs] = useState<ScannerPrefs | null>(null);
  const [theses, setTheses] = useState<ThesisResult[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: "rank", dir: "asc" });
  const [selected, setSelected] = useState<Selected | null>(null);

  // Storage is read after mount so the server render and the first client render match.
  useEffect(() => {
    setPrefs(loadPrefs());
    setTheses(loadTheses());
  }, []);

  const screen = useApi<ScreenData>(prefs ? screenUrl(prefs.extras) : null);
  const data = screen.data;
  const weights = prefs?.weights;

  const updatePrefs = (next: ScannerPrefs) => {
    setPrefs(next);
    savePrefs(next);
  };
  const view = useMemo(() => (data && weights ? buildView(data.rows, weights) : []), [data, weights]);
  const shown = useMemo(() => sortView(filterView(view, filters), sort), [view, filters, sort]);
  const sectors = useMemo(() => (data ? sectorsOf(data.rows) : []), [data]);

  const onThesis = useCallback((t: ThesisResult) => {
    setTheses((list) => {
      const next = saveThesis(list, t);
      setStorageError(next === null);
      return next ?? [t, ...list];
    });
    setSelected((s) => (s && s.symbol === t.symbol ? { ...s, thesis: t } : s));
  }, []);
  const onDelete = (t: ThesisResult) => {
    const next = deleteThesis(theses, t);
    setStorageError(next === null);
    setTheses(next ?? theses.filter((x) => x !== t));
    if (selected?.thesis === t) setSelected({ ...selected, thesis: null });
  };
  const open = (symbol: string) => setSelected({ symbol, thesis: theses.find((t) => t.symbol === symbol) ?? null });
  const close = useCallback(() => setSelected(null), []);

  const selectedView = selected ? view.find((v) => v.row.symbol === selected.symbol) ?? null : null;
  const scoredCount = view.filter((v) => v.rank !== null).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Opportunity scanner</h1>
        <p className="mt-1 max-w-[80ch] text-[13.5px] text-muted">
          Ranks the S&amp;P 100 (and any tickers you add) on value, quality, growth, catalysts and risk from SEC filings and CNBC prices.
          Scores are percentile ranks within this screen, not forecasts. Open a company to see every figure, its formula and its source.
        </p>
      </div>
      {weights && <WeightsPanel weights={weights} onChange={(w: Weights) => prefs && updatePrefs({ ...prefs, weights: w })} />}
      <Panel title="Ranked screen" className="min-w-0">
        {screen.status === "unavailable" && screen.error && <UnavailableState message={screen.error.message} missingEnv={screen.error.missingEnv} />}
        {screen.status === "error" && screen.error && <ErrorState message={screen.error.message} onRetry={screen.reload} />}
        {(screen.status === "loading" || screen.status === "idle") && <ScreenProgress extraTickers={prefs?.extras ?? []} />}
        {data && weights && (
          <>
            <FiltersBar filters={filters} sectors={sectors} onChange={setFilters} shown={shown.length} total={view.length} />
            {data.rows.length === 0 ? (
              <EmptyState title="No company could be screened" body="Every ticker failed; see the list of reasons. Try again in a few minutes." />
            ) : shown.length === 0 ? (
              <EmptyState
                title="No company matches these filters"
                action={<button type="button" className={clearBtn} onClick={() => setFilters({ ...DEFAULT_FILTERS, scoreOf: filters.scoreOf })}>Clear filters</button>}
              />
            ) : (
              <ScreenTable rows={shown} sort={sort} onSort={setSort} onOpen={open} selected={selected?.symbol ?? null} />
            )}
            <div className="space-y-1 border-t border-line px-4 py-2.5 text-[11.5px] leading-snug text-faint">
              <p>
                {data.universe.name} constituents as of {data.universe.asOf} (checked {data.universe.verifiedOn};{" "}
                <a href={data.universe.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-muted hover:underline">S&amp;P DJI release</a>
                ). {data.universe.count} tickers: Alphabet is listed with both share classes (GOOGL, GOOG). {data.rows.length} screened,{" "}
                {scoredCount} with a composite, {data.failed.length} could not be screened.
              </p>
              <p>
                Screen computed {fmtAsOf(data.computedAt)}
                {data.cached ? " (served from the server cache, refreshed every 6 hours)" : ` in ${Math.round(data.computeMs / 1000)}s`}. Prices are
                regular-session closes or last trades at that time.
              </p>
              <SourceTags list={screen.sources} />
            </div>
          </>
        )}
      </Panel>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {prefs && <ExtrasPanel extras={prefs.extras} failed={data?.failed ?? []} onChange={(extras) => updatePrefs({ ...prefs, extras })} />}
        {data && data.failed.length > 0 && (
          <Panel title="Not screened">
            <ul>
              {data.failed.map((f) => (
                <li key={f.symbol} className="border-b border-line px-4 py-2 text-[12.5px] last:border-0">
                  <span className="num font-semibold">{f.symbol}</span> <span className="text-muted">{f.reason}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <SavedTheses theses={theses} onOpen={(t) => setSelected({ symbol: t.symbol, thesis: t })} onDelete={onDelete} storageError={storageError} />
      </div>
      {selected && weights && (
        <RowDetail
          key={selected.symbol}
          symbol={selected.symbol}
          view={selectedView}
          thesis={selected.thesis}
          weights={weights}
          universeSize={scoredCount}
          onClose={close}
          onThesis={onThesis}
        />
      )}
    </div>
  );
}
