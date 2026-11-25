"use client";

import { useFetch } from "@/lib/client/use-fetch";
import { direction, fmtPct } from "@/lib/format";
import type { Performance } from "@/lib/types";

const REFRESH_MS = 10 * 60_000;
/** Same periods, in the same order, as /api/performance. */
const PERIODS = ["1W", "1M", "3M", "6M", "YTD", "1Y", "5Y"];
const TOO_YOUNG = "Not enough trading history: this listing started trading after the start of this period.";

/** Trailing returns (1W to 5Y) against the live price. */
export function PerformanceStrip({ symbol, last }: { symbol: string; last: number | null }) {
  const { data } = useFetch<Performance>(`/api/performance?symbol=${encodeURIComponent(symbol)}`, REFRESH_MS);
  const bases = data?.symbol === symbol ? data.bases : null;
  if (bases && bases.length === 0) return null;
  return (
    <section aria-label="Performance" className="grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-7">
      {PERIODS.map((label) => {
        const base = bases?.find((b) => b.label === label);
        const missing = bases != null && !base;
        const pct = base && last != null ? (last / base.close - 1) * 100 : null;
        const dir = direction(pct);
        return (
          <div key={label} className="bg-card px-3 py-2.5" title={missing ? TOO_YOUNG : undefined}>
            <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">{bases ? label : <span className="skeleton inline-block h-3 w-6" />}</div>
            <div className={`num mt-0.5 text-[14px] font-medium ${dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-muted"}`}>
              {missing ? (
                <span className="text-faint">
                  —<span className="sr-only">{TOO_YOUNG}</span>
                </span>
              ) : pct != null ? (
                fmtPct(pct, Math.abs(pct) >= 100 ? 0 : 2)
              ) : (
                <span className="skeleton inline-block h-4 w-14" />
              )}
            </div>
          </div>
        );
      })}
      <div className="bg-card sm:hidden" aria-hidden />
    </section>
  );
}
