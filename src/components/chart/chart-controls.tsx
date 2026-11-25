import type { ReactNode } from "react";
import { INTERVAL_NAMES, type Interval } from "./chart-intervals";

type ChartControlsProps = {
  /** Interval of the bars on screen. */
  interval: Interval;
  /** Intervals the user can pick (candles only); empty shows the interval as a label. */
  intervalOptions: readonly Interval[];
  onInterval: (i: Interval) => void;
  logScale: boolean;
  autoScale: boolean;
  expanded: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleLog: () => void;
  onAutoScale: () => void;
  onToggleExpand: () => void;
};

const iconBtn =
  "grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg";
const textBtn = "h-8 cursor-pointer rounded-lg px-2.5 text-[12px] font-medium transition-colors";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** Candle length: buttons on wider screens, a native menu on phones. */
function IntervalPicker({ value, options, onChange }: { value: Interval; options: readonly Interval[]; onChange: (i: Interval) => void }) {
  return (
    <>
      <div role="radiogroup" aria-label="Candle interval" className="hidden items-center gap-0.5 rounded-lg bg-hover p-0.5 sm:flex">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            title={`${INTERVAL_NAMES[o]} candles`}
            onClick={() => onChange(o)}
            className={`num h-7 min-w-8 cursor-pointer rounded-md px-1.5 text-[12px] font-medium transition-colors ${
              o === value ? "bg-card text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-muted hover:text-fg"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      <label className="relative flex items-center sm:hidden">
        <span className="sr-only">Candle interval</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Interval)}
          className="num h-8 cursor-pointer appearance-none rounded-lg bg-hover pl-2.5 pr-7 text-[12.5px] font-medium text-fg"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2 text-muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </label>
    </>
  );
}

export function ChartControls(p: ChartControlsProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-3 text-[12px] text-faint">
        {p.intervalOptions.length > 1 ? (
          <IntervalPicker value={p.interval} options={p.intervalOptions} onChange={p.onInterval} />
        ) : (
          <span className="num rounded-md bg-hover px-1.5 py-0.5 font-medium text-muted" title={`Each point is ${INTERVAL_NAMES[p.interval]}`}>{p.interval}</span>
        )}
        <span className={`hidden truncate ${p.intervalOptions.length > 1 ? "xl:block" : "md:block"}`}>Scroll to zoom · drag to pan · drag the price axis to stretch · double-click to reset</span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="Chart navigation">
        <button type="button" className={iconBtn} onClick={p.onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
          <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></Icon>
        </button>
        <button type="button" className={iconBtn} onClick={p.onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
          <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6M11 8v6" /></Icon>
        </button>
        <button type="button" className={iconBtn} onClick={p.onReset} aria-label="Reset view" title="Reset view (0)">
          <Icon><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></Icon>
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button
          type="button"
          onClick={p.onToggleLog}
          aria-pressed={p.logScale}
          title="Logarithmic price scale"
          className={`${textBtn} ${p.logScale ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg"}`}
        >
          log
        </button>
        <button
          type="button"
          onClick={p.onAutoScale}
          aria-pressed={p.autoScale}
          title="Auto-fit the price scale to visible bars"
          className={`${textBtn} ${p.autoScale ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg"}`}
        >
          auto
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button type="button" className={iconBtn} onClick={p.onToggleExpand} aria-pressed={p.expanded} aria-label={p.expanded ? "Collapse chart" : "Expand chart"} title={p.expanded ? "Collapse (Esc)" : "Expand"}>
          <Icon>
            {p.expanded ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </Icon>
        </button>
      </div>
    </div>
  );
}
