"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { impliedUpside } from "@/lib/analyst-types";
import { fmtDateKey, fmtPct, fmtPrice } from "@/lib/format";
import { dayOf, makeScales, monthLabel, nearestIndex, niceTicks, spreadLabels, YEAR_SEC, type Frame, type Point, type TargetLine } from "./chart-geometry";

const HEIGHT = 300;
const LABEL_GAP = 30;
const TONE: Record<TargetLine["id"], string> = { high: "var(--up)", average: "var(--fg)", low: "var(--down)" };

type ChartProps = { points: Point[]; price: number; targets: TargetLine[]; decimals: number };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Past year of daily closes, then dashed straight lines from the latest price to the low / average / high
 * 12-month targets. Pointer or arrow keys move a crosshair; the future side shows the targets themselves
 * (no invented values along the dashed paths).
 */
export function TargetChart({ points, price, targets, decimals }: ChartProps) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const narrow = width < 520;
  const frame: Frame = { width, height: HEIGHT, left: 46, right: targets.length ? (narrow ? 84 : 128) : 12, top: 14, bottom: 26 };
  const s = useMemo(() => (width > 0 ? makeScales(points, price, targets, frame) : null), [points, price, targets, width, narrow]); // eslint-disable-line react-hooks/exhaustive-deps
  const futureIndex = points.length; // keyboard / hover index meaning "the 12-month targets"

  if (!s) return <div ref={ref} style={{ height: HEIGHT }} />;

  const p = (v: number) => fmtPrice(v, decimals);
  const path = points.map((pt, i) => `${i ? "L" : "M"}${s.x(pt.t).toFixed(1)},${s.y(pt.c).toFixed(1)}`).join("");
  const nowX = s.x(s.tNow);
  const nowY = s.y(price);
  const endX = s.x(s.tEnd);
  const ticks = niceTicks(s.lo, s.hi, 4);
  const labelYs = spreadLabels(targets.map((t) => s.y(t.value)), LABEL_GAP, frame.top + 6, HEIGHT - frame.bottom - 16);
  const high = targets.find((t) => t.id === "high");
  const low = targets.find((t) => t.id === "low");
  const xTicks = narrow
    ? [s.t0, s.tNow, ...(targets.length ? [s.tEnd] : [])]
    : [s.t0, s.t0 + (s.tNow - s.t0) / 2, s.tNow, ...(targets.length ? [s.tNow + YEAR_SEC / 2, s.tEnd] : [])];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = s.tFromX(e.clientX - box.left);
    setHover(t > s.tNow && targets.length ? futureIndex : nearestIndex(points, t));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const max = targets.length ? futureIndex : points.length - 1;
    const step = e.shiftKey ? 20 : 5;
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? max) - step));
    else if (e.key === "ArrowRight") setHover((h) => Math.min(max, (h ?? 0) + (h === points.length - 1 ? 1 : step)));
    else if (e.key === "End") setHover(max);
    else if (e.key === "Home") setHover(0);
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const pastPoint = hover != null && hover < points.length ? points[hover] : null;
  const showFuture = hover === futureIndex && targets.length > 0;
  const tipX = pastPoint ? s.x(pastPoint.t) : showFuture ? endX : 0;
  const summary = targets.length
    ? `Price over the past year, last ${p(price)}. 12-month analyst targets: ${targets.map((t) => `${t.label} ${p(t.value)}`).join(", ")}.`
    : `Price over the past year, last ${p(price)}.`;

  return (
    <div ref={ref} className="relative select-none">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${summary} Use arrow keys to inspect values.`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        className="block touch-pan-y rounded-md"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={frame.left} x2={width - frame.right} y1={s.y(v)} y2={s.y(v)} stroke="var(--chart-grid)" />
            <text x={frame.left - 6} y={s.y(v)} dy="0.32em" textAnchor="end" className="num fill-[var(--faint)] text-[10.5px]">
              {fmtPrice(v, v >= 100 ? 0 : decimals)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={s.x(t)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-[var(--faint)] text-[10.5px]">
            {monthLabel(t)}
          </text>
        ))}
        {high && low && (
          <polygon points={`${nowX},${nowY} ${endX},${s.y(high.value)} ${endX},${s.y(low.value)}`} fill="var(--fg)" opacity={0.045} />
        )}
        {targets.length > 0 && <line x1={nowX} x2={nowX} y1={frame.top} y2={HEIGHT - frame.bottom} stroke="var(--line-strong)" strokeDasharray="2 3" />}
        <path d={path} fill="none" stroke="var(--fg)" strokeWidth={1.6} strokeLinejoin="round" />
        {targets.map((t) => (
          <line key={t.id} x1={nowX} y1={nowY} x2={endX} y2={s.y(t.value)} stroke={TONE[t.id]} strokeWidth={1.5} strokeDasharray="5 4" />
        ))}
        <circle cx={nowX} cy={nowY} r={3.5} fill="var(--fg)" stroke="var(--card)" strokeWidth={1.5} />
        {targets.map((t, i) => {
          const up = impliedUpside(t.value, price);
          return (
            <g key={t.id}>
              <circle cx={endX} cy={s.y(t.value)} r={3} fill={TONE[t.id]} />
              <text x={endX + 8} y={labelYs[i] - 3} className="num text-[11px] font-semibold" fill={TONE[t.id]}>
                <tspan>{narrow ? p(t.value) : `${t.label} ${p(t.value)}`}</tspan>
                <tspan x={endX + 8} dy="1.2em" className="font-normal" fill="var(--muted)">
                  {narrow ? `${t.label} ${fmtPct(up, 0)}` : `${fmtPct(up, 1)}`}
                </tspan>
              </text>
            </g>
          );
        })}
        {(pastPoint || showFuture) && (
          <line x1={tipX} x2={tipX} y1={frame.top} y2={HEIGHT - frame.bottom} stroke="var(--muted)" strokeWidth={1} opacity={0.6} />
        )}
        {pastPoint && <circle cx={tipX} cy={s.y(pastPoint.c)} r={4} fill="var(--fg)" stroke="var(--card)" strokeWidth={2} />}
      </svg>
      {(pastPoint || showFuture) && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
          style={tipX > width / 2 ? { right: Math.max(4, width - tipX + 10) } : { left: tipX + 10 }}
          aria-live="polite"
        >
          {pastPoint ? (
            <>
              <div className="text-faint">{fmtDateKey(dayOf(pastPoint.t), true)}</div>
              <div className="num font-medium">Close {p(pastPoint.c)}</div>
            </>
          ) : (
            <>
              <div className="text-faint">12-month analyst targets</div>
              {targets.map((t) => (
                <div key={t.id} className="num flex justify-between gap-4">
                  <span style={{ color: TONE[t.id] }}>{t.label}</span>
                  <span>
                    {p(t.value)} <span className="text-muted">({fmtPct(impliedUpside(t.value, price), 1)})</span>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
