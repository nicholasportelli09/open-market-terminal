"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { fmtAsOf, fmtBp, fmtNumber } from "@/lib/format";
import type { CurveSnapshot } from "@/lib/macro/curve";
import { TREASURY_TENORS } from "@/lib/macro/series";

const H = 220;
const PAD = { l: 40, r: 12, t: 14, b: 26 };
const DEFAULT_TENOR = "DGS10";

/** Line style per snapshot: latest is solid foreground, older curves are lighter and dashed. */
const STYLE: Record<CurveSnapshot["key"], { stroke: string; dash?: string; width: number }> = {
  now: { stroke: "var(--fg)", width: 2 },
  m1: { stroke: "var(--accent)", dash: "5 4", width: 1.5 },
  y1: { stroke: "var(--faint)", dash: "2 3", width: 1.5 },
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure right away (before paint), then follow resizes.
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceTicks(lo: number, hi: number): number[] {
  const step = hi - lo > 2 ? 0.5 : 0.25;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function valueAt(s: CurveSnapshot | undefined, id: string): number | null {
  return s?.points.find((p) => p.id === id)?.value ?? null;
}

/** Treasury yield curve: latest vs about 1 month and 1 year ago, with hover / focus readouts per tenor. */
export function CurveChart({ snapshots }: { snapshots: CurveSnapshot[] }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string>(DEFAULT_TENOR);
  const now = snapshots.find((s) => s.key === "now");
  const all = snapshots.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.floor((Math.min(...all) - 0.1) * 4) / 4;
  const hi = Math.ceil((Math.max(...all) + 0.1) * 4) / 4;
  const W = Math.max(width, 280);
  const xOf = (years: number) => PAD.l + (Math.sqrt(years) / Math.sqrt(30)) * (W - PAD.l - PAD.r);
  const yOf = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const tenor = TREASURY_TENORS.find((t) => t.id === active) ?? TREASURY_TENORS[7];
  const cur = valueAt(now, tenor.id);
  const hideOddLabels = W < 420;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]" aria-live="polite">
        <span className="font-semibold">{tenor.tenor} Treasury</span>
        {snapshots.map((s) => {
          const v = valueAt(s, tenor.id);
          const diff = s.key !== "now" && v !== null && cur !== null ? ` (${fmtBp(cur - v)} since)` : "";
          return (
            <span key={s.key} className="flex items-baseline gap-1.5">
              <span className="inline-block h-0.5 w-3 self-center" style={{ background: STYLE[s.key].stroke }} aria-hidden />
              <span className="text-faint">{s.label}</span>
              <span className="num">{v !== null ? `${fmtNumber(v, 2)}%` : "—"}</span>
              {diff && <span className="num text-muted">{diff}</span>}
            </span>
          );
        })}
      </div>
      <div ref={ref} className="w-full">
        {width > 0 && (
          <svg width={W} height={H} role="group" aria-label="US Treasury yield curve, latest versus 1 month and 1 year ago" className="block">
            {niceTicks(lo, hi).map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--chart-grid)" />
                <text x={PAD.l - 6} y={yOf(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--faint)" className="num">
                  {v.toFixed(2)}%
                </text>
              </g>
            ))}
            {TREASURY_TENORS.map((t, i) => (
              <text key={t.id} x={xOf(t.years)} y={H - 8} textAnchor="middle" fontSize="10.5" fill={t.id === active ? "var(--fg)" : "var(--faint)"} className="num">
                {hideOddLabels && i % 2 === 1 && i !== TREASURY_TENORS.length - 1 && t.id !== active ? "" : t.tenor}
              </text>
            ))}
            <line x1={xOf(tenor.years)} x2={xOf(tenor.years)} y1={PAD.t} y2={H - PAD.b} stroke="var(--line-strong)" />
            {[...snapshots].reverse().map((s) => {
              const d = s.points.map((p, i) => `${i ? "L" : "M"}${xOf(p.years).toFixed(1)},${yOf(p.value).toFixed(1)}`).join("");
              const st = STYLE[s.key];
              return (
                <g key={s.key}>
                  <path d={d} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinejoin="round" />
                  {s.points
                    .filter((p) => p.id === tenor.id)
                    .map((p) => (
                      <circle key={p.id} cx={xOf(p.years)} cy={yOf(p.value)} r="3.5" fill="var(--card)" stroke={st.stroke} strokeWidth="1.5" />
                    ))}
                </g>
              );
            })}
            {TREASURY_TENORS.map((t, i) => {
              const prev = TREASURY_TENORS[i - 1];
              const next = TREASURY_TENORS[i + 1];
              const x0 = prev ? (xOf(prev.years) + xOf(t.years)) / 2 : PAD.l;
              const x1 = next ? (xOf(next.years) + xOf(t.years)) / 2 : W - PAD.r;
              const v = valueAt(now, t.id);
              return (
                <rect
                  key={t.id}
                  x={x0}
                  y={PAD.t}
                  width={Math.max(1, x1 - x0)}
                  height={H - PAD.t - PAD.b}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-pressed={t.id === active}
                  aria-label={`${t.tenor} Treasury, latest ${v !== null ? `${fmtNumber(v, 2)}%` : "not available"}`}
                  onMouseEnter={() => setActive(t.id)}
                  onFocus={() => setActive(t.id)}
                  onClick={() => setActive(t.id)}
                  className="cursor-crosshair outline-none focus-visible:stroke-[var(--focus)]"
                />
              );
            })}
          </svg>
        )}
        {width === 0 && <div style={{ height: H }} />}
      </div>
      {hideOddLabels && (
        <div role="group" aria-label="Choose a tenor" className="mt-2 flex flex-wrap gap-1.5">
          {TREASURY_TENORS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === active}
              onClick={() => setActive(t.id)}
              className={`num h-8 min-w-[40px] rounded-md border px-2 text-[12px] font-medium transition-colors ${
                t.id === active ? "border-line-strong bg-hover text-fg" : "border-line text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {t.tenor}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11.5px] text-faint">
        Dates: {snapshots.map((s) => `${s.label.toLowerCase()} ${fmtAsOf(s.date)}`).join(", ")}.
      </p>
    </div>
  );
}
