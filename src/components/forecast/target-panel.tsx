"use client";

import { useMemo, type ReactNode } from "react";
import type { AnalystTargets } from "@/lib/analyst-types";
import { presetBars } from "@/lib/chart-shared";
import { useFetch } from "@/lib/client/use-fetch";
import { type Provenance, priceFeedOf } from "@/lib/provenance";
import type { ChartPayload } from "@/lib/types";
import { Panel } from "@/components/ui/panel";
import { dayOf, type Point, type TargetLine } from "./chart-geometry";
import { SourcesFooter } from "./section-state";
import { TargetChart } from "./target-chart";
import { TargetTable } from "./target-table";

type TargetPanelProps = {
  symbol: string;
  title: string;
  /** Undefined while analyst data loads; null when there are no targets. */
  targets: AnalystTargets | null | undefined;
  /** Shown instead of the table when there are no targets (why: not configured, plan, no coverage). */
  missing: ReactNode;
  livePrice: number | null;
  priceProvenance: Provenance | null;
  decimals: number;
};

function targetLines(t: AnalystTargets | null | undefined): TargetLine[] {
  if (!t) return [];
  const out: TargetLine[] = [];
  if (t.high != null) out.push({ id: "high", label: "High", value: t.high });
  if (t.average != null) out.push({ id: "average", label: "Avg", value: t.average });
  if (t.low != null) out.push({ id: "low", label: "Low", value: t.low });
  return out;
}

/** Price-target chart (past year + 12-month projections) beside the Low / Average / Median / High table. */
export function TargetPanel({ symbol, title, targets, missing, livePrice, priceProvenance, decimals }: TargetPanelProps) {
  const chart = useFetch<ChartPayload>(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=1Y`);
  const points: Point[] = useMemo(() => (chart.data ? presetBars(chart.data).map((b) => ({ t: b.t, c: b.c })).filter((p) => p.c > 0) : []), [chart.data]);
  const lines = useMemo(() => targetLines(targets), [targets]);
  const price = livePrice ?? points.at(-1)?.c ?? null;

  const historyProv: Provenance | null = points.length
    ? { source: priceFeedOf(symbol), asOf: dayOf(points[points.length - 1].t), note: "Daily closes, past year" }
    : null;
  const sources = [historyProv, priceProvenance, targets?.provenance ?? null].filter((p): p is Provenance => !!p);

  let chartBody: ReactNode;
  if (points.length > 1 && price != null) chartBody = <TargetChart points={points} price={price} targets={lines} decimals={decimals} />;
  else if (chart.loading || (!chart.data && !chart.error)) chartBody = <div className="skeleton h-[300px]" role="status" aria-label="Loading chart" />;
  else chartBody = <p className="flex h-[300px] items-center justify-center text-center text-[13px] text-muted">Price history is unavailable right now{chart.error ? ` (${chart.error})` : ""}.</p>;

  let side: ReactNode;
  if (targets === undefined) side = <div className="space-y-3 p-4" role="status" aria-label="Loading targets">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-5" />)}</div>;
  else if (targets === null) side = missing;
  else side = <TargetTable targets={targets} price={price} decimals={decimals} />;

  return (
    <Panel title={title}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 px-2 pb-2 pt-3 sm:px-3">{chartBody}</div>
        <div className="border-t border-line lg:border-l lg:border-t-0">
          {side}
          {targets && (
            <p className="px-4 pb-3 pt-2 text-[12px] leading-snug text-faint">
              Dashed lines run straight from the latest price to each 12-month target; they are not a price path forecast.
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-line">
        <SourcesFooter list={sources} />
      </div>
    </Panel>
  );
}
