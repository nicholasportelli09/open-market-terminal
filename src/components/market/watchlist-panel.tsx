"use client";

import Link from "next/link";
import { useQuotes } from "@/lib/client/quote-store";
import { useWatchlist } from "@/lib/client/watchlist";
import { displayTicker, hasShortName, quoteHref, shortName } from "@/lib/instruments";
import { instrumentSession } from "@/lib/market-session";
import { Change } from "@/components/ui/change";
import { Panel } from "@/components/ui/panel";
import { Price } from "@/components/ui/price";
import { SessionMark } from "@/components/ui/source-tag";

export function WatchlistPanel({ activeSymbol }: { activeSymbol?: string }) {
  const { list, remove } = useWatchlist();
  const quotes = useQuotes(list);

  return (
    <Panel title="Watchlist" action={<span className="text-[12px] text-faint">{list.length} symbols</span>}>
      {list.length === 0 && (
        <p className="px-4 py-6 text-center text-[13px] text-muted">Open any instrument and press Watch to add it here.</p>
      )}
      <ul>
        {list.map((s) => {
          const q = quotes[s];
          const label = hasShortName(s) ? shortName(s) : q?.name ?? "";
          return (
            <li key={s} className={`group relative border-b border-line last:border-0 ${activeSymbol === s ? "bg-hover" : ""}`}>
              <Link href={quoteHref(s)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="num block text-[13.5px] font-semibold">{displayTicker(s)}</span>
                  <span className="flex min-w-0 items-baseline gap-1.5 text-[12px] text-faint">
                    <span className="truncate">{label}</span>
                    {q && <SessionMark session={instrumentSession(q, new Date())} delayed={q.delayed} className="shrink-0 before:mr-1.5 before:content-['·']" />}
                  </span>
                </span>
                {q ? (
                  <span className="flex flex-col items-end gap-0.5 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                    <Price value={q.last} decimals={q.decimals} isYield={q.isYield} className="text-[13.5px] font-medium" />
                    <Change pct={q.changePct} variant="pill" className="!min-w-0 !py-0 text-[12px]" />
                  </span>
                ) : (
                  <span className="skeleton h-8 w-20" />
                )}
              </Link>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Remove ${displayTicker(s)} from watchlist`}
                className="absolute right-3 top-1/2 hidden h-8 -translate-y-1/2 cursor-pointer rounded-lg border border-line bg-card px-2.5 text-[12px] text-muted hover:text-down group-hover:block focus-visible:block"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
