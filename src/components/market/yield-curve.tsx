"use client";

import { useQuotes } from "@/lib/client/quote-store";
import { YIELD_CURVE } from "@/lib/instruments";
import { fmtNumber, fmtSigned } from "@/lib/format";
import { Panel } from "@/components/ui/panel";

const W = 320;
const H = 150;
const PAD = { l: 8, r: 8, t: 16, b: 22 };

/** Tenor axis on a sqrt scale so the short end is readable. */
function xOf(years: number): number {
  const max = Math.sqrt(30);
  return PAD.l + (Math.sqrt(years) / max) * (W - PAD.l - PAD.r);
}

export function YieldCurve() {
  const quotes = useQuotes(YIELD_CURVE.map((p) => p.symbol));
  const pts = YIELD_CURVE.map((p) => ({ ...p, y: quotes[p.symbol]?.last ?? null })).filter(
    (p): p is typeof p & { y: number } => p.y !== null,
  );
  const ready = pts.length >= 4;
  const ys = pts.map((p) => p.y);
  const min = Math.min(...ys) - 0.1;
  const max = Math.max(...ys) + 0.1;
  const yOf = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${xOf(p.years).toFixed(1)},${yOf(p.y).toFixed(1)}`).join("");

  const y2 = quotes.US2Y?.last;
  const y10 = quotes.US10Y?.last;
  const spreadBp = y2 != null && y10 != null ? (y10 - y2) * 100 : null;

  return (
    <Panel
      title="US Treasury curve"
      action={
        spreadBp !== null && (
          <span className="num text-[12px] text-muted">
            2s10s <span className={spreadBp >= 0 ? "text-up" : "text-down"}>{fmtSigned(spreadBp, 0)} bp</span>
          </span>
        )
      }
    >
      <div className="px-3 pb-3 pt-2">
        {!ready ? (
          <div className="skeleton h-[150px]" />
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="US Treasury yield curve">
            {pts.map((p) => (
              <g key={p.symbol}>
                <line x1={xOf(p.years)} x2={xOf(p.years)} y1={PAD.t} y2={H - PAD.b} stroke="var(--chart-grid)" />
                <text x={xOf(p.years)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--faint)" className="num">{p.tenor}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke="var(--fg)" strokeWidth="1.75" strokeLinejoin="round" />
            {pts.map((p) => (
              <g key={`d-${p.symbol}`}>
                <circle cx={xOf(p.years)} cy={yOf(p.y)} r="2.75" fill="var(--card)" stroke="var(--fg)" strokeWidth="1.5" />
                <text x={xOf(p.years)} y={yOf(p.y) - 7} textAnchor="middle" fontSize="9" fill="var(--muted)" className="num">
                  {fmtNumber(p.y, 2)}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </Panel>
  );
}
