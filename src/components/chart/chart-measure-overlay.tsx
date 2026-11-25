"use client";

import type { IChartApi, ISeriesApi, Logical, SeriesType } from "lightweight-charts";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { fmtPct, fmtSigned } from "@/lib/format";
import type { Bar, Range } from "@/lib/types";
import type { Interval } from "./chart-intervals";
import { formatSpan, indexOfTime, measureBetween } from "./chart-measure";
import type { MeasureDrag } from "./use-chart-measure";

type Props = {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  bars: readonly Bar[];
  drag: MeasureDrag | null;
  mode: "line" | "candles";
  range: Range;
  interval: Interval;
  decimals: number;
};

const EDGE_PX = 4;
const PILL_TOP_PX = 6;

/** The shaded stretch, the two marked points and the change readout while the user drags across the chart. */
export function ChartMeasureOverlay({ chart, series, bars, drag, mode, range, interval, decimals }: Props) {
  const pillRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ w: 0, h: 0 });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const m = drag && bars.length ? measureBetween(bars, indexOfTime(bars, drag.a), indexOfTime(bars, drag.b)) : null;
  const active = m !== null;

  // Zooming or scrolling while a measure is shown moves the bars; follow them.
  useEffect(() => {
    if (!active || !chart) return;
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(redraw);
    return () => ts.unsubscribeVisibleLogicalRangeChange(redraw);
  }, [active, chart]);
  const label = m ? `${fmtSigned(m.change, decimals)}${m.pct === null ? "" : ` (${fmtPct(m.pct)})`}` : "";
  const span = m ? formatSpan(m.start.t, m.end.t, range, interval) : "";

  useLayoutEffect(() => {
    const w = pillRef.current?.offsetWidth ?? 0;
    const h = pillRef.current?.offsetHeight ?? 0;
    setPill((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [label, span]);

  if (!m || !chart || !series) return null;
  const pane = chart.paneSize(0);
  const x = (i: number) => chart.timeScale().logicalToCoordinate(i as Logical);
  const y = (i: number) => series.priceToCoordinate(bars[i].c);
  const x0 = x(m.lo);
  const x1 = x(m.hi);
  const y0 = y(m.lo);
  const y1 = y(m.hi);
  if (x0 === null || x1 === null) return null;

  const color = m.up ? "var(--up)" : "var(--down)";
  const fillId = m.up ? "measure-fill-up" : "measure-fill-down";
  // Line charts shade the area under the line between the points; candle charts shade the whole column.
  let area = `M${x0},${pane.height} L${x1},${pane.height} L${x1},0 L${x0},0 Z`;
  if (mode === "line") {
    const pts: string[] = [];
    for (let i = m.lo; i <= m.hi; i++) {
      const px = x(i);
      const py = y(i);
      if (px !== null && py !== null) pts.push(`${px},${py}`);
    }
    if (pts.length > 1) area = `M${x0},${pane.height} L${pts.join(" L")} L${x1},${pane.height} Z`;
  }
  const centre = (x0 + x1) / 2;
  const half = pill.w / 2;
  const left = Math.min(Math.max(centre, half + EDGE_PX), Math.max(half + EDGE_PX, pane.width - half - EDGE_PX));
  // The readout sits at the top unless a marked point is under it there; then at the bottom if that is clear.
  const bottom = Math.max(PILL_TOP_PX, pane.height - pill.h - PILL_TOP_PX);
  const covers = (top: number) =>
    [
      { px: x0, py: y0 },
      { px: x1, py: y1 },
    ].some(({ px, py }) => py !== null && py > top - 8 && py < top + pill.h + 8 && Math.abs(px - left) < half + 8);
  const pillTop = covers(PILL_TOP_PX) && !covers(bottom) ? bottom : PILL_TOP_PX;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <svg width={pane.width} height={pane.height} className="absolute left-0 top-0 overflow-hidden" aria-hidden>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: mode === "line" ? 0.34 : 0.14 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: mode === "line" ? 0.04 : 0.14 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} />
        {[x0, x1].map((lx, i) => (
          <line key={i} x1={lx} x2={lx} y1={0} y2={pane.height} style={{ stroke: "var(--faint)" }} strokeWidth={1} strokeDasharray="3 3" />
        ))}
        {[
          { cx: x0, cy: y0 },
          { cx: x1, cy: y1 },
        ].map(({ cx, cy }, i) =>
          cy === null ? null : <circle key={i} cx={cx} cy={cy} r={4.5} style={{ fill: color, stroke: "var(--card)" }} strokeWidth={2} />,
        )}
      </svg>
      <div
        ref={pillRef}
        data-testid="chart-measure"
        className="num absolute flex w-max -translate-x-1/2 flex-wrap items-baseline justify-center gap-x-2 rounded-lg border border-line bg-card/95 px-2.5 py-1 text-[12.5px] shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
        style={{ left, top: pillTop, maxWidth: pane.width - 2 * EDGE_PX }}
      >
        <span className={`whitespace-nowrap font-semibold ${m.up ? "text-up" : "text-down"}`}>{label}</span>
        <span className="whitespace-nowrap text-muted">{span}</span>
      </div>
    </div>
  );
}
