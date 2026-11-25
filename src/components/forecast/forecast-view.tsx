"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnalystData } from "@/lib/analyst-types";
import { useApi } from "@/lib/client/use-api";
import { useFeedStatus, useQuote } from "@/lib/client/quote-store";
import { displayTicker } from "@/lib/instruments";
import { quoteProvenance } from "@/lib/market-session";
import { QuoteHeader } from "@/components/quote/quote-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { ForecastBody } from "./forecast-body";
import { InstrumentNav } from "./instrument-nav";

const MISSING_AFTER_MS = 6_000;

/** /q/[symbol]/forecast: analyst consensus, price targets, rating distribution and history, plus our own model. */
export function ForecastView({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  const { status } = useFeedStatus();
  const [waited, setWaited] = useState(false);
  const isStock = quote ? quote.type === "STOCK" : true;
  // Prefer waiting for the quote so non-stocks (indices, FX) never hit the analyst API, but never block on a
  // feed outage: if the quote feed errors or stays silent, fetch anyway (the route reports no coverage honestly).
  const feedDown = !quote && (status === "error" || (waited && status !== "live"));
  const fetchAnalyst = quote ? quote.type === "STOCK" : feedDown;
  const analyst = useApi<AnalystData>(fetchAnalyst ? `/api/analyst?symbol=${encodeURIComponent(symbol)}` : null);

  useEffect(() => {
    document.title = `${displayTicker(symbol)} forecast · Terminal`;
    setWaited(false);
    const t = setTimeout(() => setWaited(true), MISSING_AFTER_MS);
    return () => clearTimeout(t);
  }, [symbol]);

  const missing = !quote && waited && status === "live";
  const priceProvenance = quote ? quoteProvenance(quote, new Date()) : null;

  return (
    <div className="space-y-5">
      <QuoteHeader symbol={symbol} quote={quote} missing={missing} />
      <InstrumentNav symbol={symbol} active="forecast" isStock={isStock} />
      {missing ? null : !isStock ? (
        <Panel title="Forecast">
          <EmptyState
            title="Analyst forecasts cover individual stocks"
            body={`${displayTicker(symbol)} is not a stock, so there are no analyst ratings or price targets for it.`}
            action={<Link href={`/q/${encodeURIComponent(symbol)}`} className="mt-2 inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">Back to overview</Link>}
          />
        </Panel>
      ) : (
        <ForecastBody symbol={symbol} analyst={analyst} price={quote?.last ?? null} priceProvenance={priceProvenance} decimals={quote?.decimals ?? 2} />
      )}
    </div>
  );
}
