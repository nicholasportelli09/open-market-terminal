import type { ReactNode } from "react";
import { fmtCompact, fmtPrice } from "@/lib/format";
import type { Range } from "@/lib/types";
import { formatBarTime } from "./chart-data";
import type { Interval } from "./chart-intervals";

export type HoverInfo = { t: number; value: number; o?: number; h?: number; l?: number; c?: number; v?: number };

type ChartLegendProps = {
  hover: HoverInfo | null;
  range: Range;
  mode: "line" | "candles";
  interval?: Interval;
  decimals: number;
  isYield?: boolean;
  summary: ReactNode;
};

export function ChartLegend({ hover, range, mode, interval, decimals, isYield, summary }: ChartLegendProps) {
  const p = (n?: number) => fmtPrice(n, decimals, isYield);
  return (
    <div className="pointer-events-none relative z-10 flex h-[52px] flex-wrap overflow-hidden sm:h-auto sm:min-h-8 items-baseline gap-x-3 gap-y-0.5 px-3 pt-2 text-[12.5px]">
      {hover ? (
        <>
          <span className="text-muted">{formatBarTime(hover.t, range, interval)}</span>
          {mode === "candles" && hover.o !== undefined ? (
            <span className="num flex flex-wrap gap-x-2.5 text-fg">
              <span><span className="text-faint">O</span> {p(hover.o)}</span>
              <span><span className="text-faint">H</span> {p(hover.h)}</span>
              <span><span className="text-faint">L</span> {p(hover.l)}</span>
              <span><span className="text-faint">C</span> {p(hover.c)}</span>
              {!!hover.v && <span><span className="text-faint">Vol</span> {fmtCompact(hover.v)}</span>}
            </span>
          ) : (
            <span className="num font-medium text-fg">{p(hover.value)}</span>
          )}
        </>
      ) : (
        summary && <span className="num">{summary}</span>
      )}
    </div>
  );
}
