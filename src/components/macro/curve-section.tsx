"use client";

import { useMemo } from "react";
import { fmtBp, fmtNumber } from "@/lib/format";
import { curveSnapshots, type CurveSnapshot } from "@/lib/macro/curve";
import type { Point } from "@/lib/macro/math";
import { TREASURY_TENORS, fredSeriesPage } from "@/lib/macro/series";
import { SourceTag } from "@/components/ui/source-tag";
import { CardShell } from "./macro-card";
import { CurveChart } from "./curve-chart";
import { GroupGate, Section, SeriesCards } from "./section";
import type { GroupState, SeriesSlot } from "./use-macro-data";

function CurveTable({ snapshots }: { snapshots: CurveSnapshot[] }) {
  const now = snapshots.find((s) => s.key === "now");
  const v = (s: CurveSnapshot | undefined, id: string) => s?.points.find((p) => p.id === id)?.value ?? null;
  return (
    <details className="mt-2 text-[12.5px]">
      <summary className="cursor-pointer select-none text-muted hover:text-fg">Show values as a table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[440px] text-left">
          <thead className="text-[11.5px] text-faint">
            <tr>
              <th className="py-1 pr-3 font-medium">Tenor</th>
              {snapshots.map((s) => (
                <th key={s.key} className="py-1 pr-3 text-right font-medium">{s.label}</th>
              ))}
              {snapshots.filter((s) => s.key !== "now").map((s) => (
                <th key={`d-${s.key}`} className="py-1 pr-3 text-right font-medium">Since {s.key === "m1" ? "1m" : "1y"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TREASURY_TENORS.map((t) => {
              const cur = v(now, t.id);
              return (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-1 pr-3">
                    <a href={fredSeriesPage(t.id)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                      {t.tenor}
                    </a>
                  </td>
                  {snapshots.map((s) => {
                    const x = v(s, t.id);
                    return <td key={s.key} className="num py-1 pr-3 text-right">{x !== null ? `${fmtNumber(x, 2)}%` : "—"}</td>;
                  })}
                  {snapshots.filter((s) => s.key !== "now").map((s) => {
                    const x = v(s, t.id);
                    return <td key={`d-${s.key}`} className="num py-1 pr-3 text-right">{x !== null && cur !== null ? fmtBp(cur - x) : "—"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

type Props = { state: GroupState; slots: Map<string, SeriesSlot> };

/** Treasury curve chart (latest vs ~1m vs ~1y) plus the 10y-2y and 10y-3m spreads with history. */
export function CurveSection({ state, slots }: Props) {
  const raw = useMemo(() => {
    const out: Record<string, Point[] | undefined> = {};
    for (const t of TREASURY_TENORS) out[t.id] = slots.get(t.id)?.raw ?? undefined;
    return out;
  }, [slots]);
  const snapshots = useMemo(() => curveSnapshots(raw), [raw]);
  const now = snapshots.find((s) => s.key === "now");
  const missing = TREASURY_TENORS.filter((t) => !slots.get(t.id)?.reading).map((t) => t.tenor);

  return (
    <Section
      id="curve"
      title="Yield curve"
      explainer="US borrowing costs from 1 month to 30 years; inverted when short rates are higher."
    >
      <GroupGate state={state} skeletons={3}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <CardShell
            title="US Treasury curve"
            detail="Constant-maturity yields; hover or tab through the tenors to compare"
            badge="Daily"
            footer={
              now ? (
                <SourceTag provenance={{ source: "fred", asOf: now.date, session: "n/a", url: fredSeriesPage("DGS10"), note: "DGS1MO to DGS30 · daily" }} />
              ) : undefined
            }
          >
            {now ? (
              <>
                <CurveChart snapshots={snapshots} />
                {missing.length > 0 && <p className="mt-1 text-[12px] text-faint">Not available from FRED right now: {missing.join(", ")}.</p>}
                <CurveTable snapshots={snapshots} />
              </>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted">Not enough Treasury tenors came back from FRED to draw the curve.</p>
            )}
          </CardShell>
          <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <SeriesCards ids={["T10Y2Y", "T10Y3M"]} slots={slots} sparkMonths={24} />
          </div>
        </div>
      </GroupGate>
    </Section>
  );
}
