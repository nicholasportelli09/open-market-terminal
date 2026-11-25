"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuotes } from "@/lib/client/quote-store";
import { useFetch } from "@/lib/client/use-fetch";
import { MARKET_TABS, quoteHref, shortName } from "@/lib/instruments";
import { direction, fmtChange } from "@/lib/format";
import { instrumentSession } from "@/lib/market-session";
import { Change } from "@/components/ui/change";
import { Segmented } from "@/components/ui/panel";
import { Price } from "@/components/ui/price";
import { Sparkline } from "@/components/ui/sparkline";
import { SessionMark } from "@/components/ui/source-tag";

const SPARK_REFRESH_MS = 60_000;

export function MarketOverview() {
  const [tabId, setTabId] = useState(MARKET_TABS[0].id);
  const tab = MARKET_TABS.find((t) => t.id === tabId) ?? MARKET_TABS[0];
  const quotes = useQuotes(tab.symbols);
  const { data } = useFetch<{ sparks: Record<string, number[]> }>(
    `/api/spark?symbols=${encodeURIComponent(tab.symbols.join(","))}`,
    SPARK_REFRESH_MS,
  );

  return (
    <section aria-labelledby="markets-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 id="markets-heading" className="text-[22px] font-semibold tracking-tight">Markets</h1>
        <Segmented label="Market" options={MARKET_TABS} value={tabId} onChange={setTabId} size="md" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tab.symbols.map((s) => {
          const q = quotes[s];
          const up = direction(q?.changePct ?? q?.change) !== "down";
          return (
            <Link
              key={s}
              href={quoteHref(s)}
              className="group flex min-w-0 flex-col rounded-2xl border border-line bg-card p-3.5 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_4px_18px_rgba(0,0,0,0.06)]"
            >
              <span className="truncate text-[13.5px] font-semibold">{shortName(s, q?.name)}</span>
              {q ? (
                <>
                  <Price value={q.last} decimals={q.decimals} isYield={q.isYield} className="mt-1.5 text-[19px] font-medium" />
                  <span className="mt-0.5 flex items-baseline gap-1.5 text-[12.5px]">
                    <Change pct={q.changePct} />
                    <span className="num text-faint">{fmtChange(q.change, q.decimals, q.isYield)}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="skeleton mt-2 h-6 w-28" />
                  <span className="skeleton mt-1.5 h-4 w-20" />
                </>
              )}
              <Sparkline
                points={data?.sparks[s]}
                baseline={q?.prevClose}
                up={up}
                width={200}
                height={44}
                className="mt-3 h-11 w-full"
              />
              <span className="mt-2 block h-4 truncate text-[11px] leading-4">
                {q && <SessionMark session={instrumentSession(q, new Date())} delayed={q.delayed} showLive />}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
