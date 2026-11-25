"use client";

import { useEffect, useState } from "react";
import { useFeedStatus, useQuote } from "@/lib/client/quote-store";
import { displayTicker, hasShortName, shortName } from "@/lib/instruments";
import { PriceChart } from "@/components/chart/price-chart";
import { NewsList } from "@/components/market/news-list";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { InstrumentNav } from "@/components/forecast/instrument-nav";
import { SourceTag } from "@/components/ui/source-tag";
import { AnalystTarget } from "./analyst-target";
import { Financials } from "./financials";
import { KeyStats } from "./key-stats";
import { PerformanceStrip } from "./performance-strip";
import { QuoteHeader } from "./quote-header";

const MISSING_AFTER_MS = 6_000;

function newsQuery(symbol: string, name: string | undefined): string {
  if (hasShortName(symbol)) return `${shortName(symbol).replace(/\//g, " ")} price`;
  const clean = (name ?? "").replace(/\b(Inc|Corp|Corporation|Ltd|PLC|Co|Class [A-C]|Holdings?)\b\.?/gi, "").replace(/[^\p{L}\p{N} .&-]/gu, "").trim();
  return `${displayTicker(symbol)} ${clean} stock`.trim().slice(0, 80);
}

export function QuoteView({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  const { status } = useFeedStatus();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const label = hasShortName(symbol) ? shortName(symbol) : displayTicker(symbol);
    document.title = quote?.last != null ? `${label} ${quote.last.toLocaleString("en-US")} · Terminal` : `${label} · Terminal`;
  }, [symbol, quote?.last]);

  useEffect(() => {
    setWaited(false);
    const t = setTimeout(() => setWaited(true), MISSING_AFTER_MS);
    return () => clearTimeout(t);
  }, [symbol]);

  const missing = !quote && waited && status === "live";
  // Statements (Nasdaq) and analyst data (licensed FMP / Finnhub) cover stocks only.
  const isStock = quote?.type === "STOCK";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <QuoteHeader symbol={symbol} quote={quote} missing={missing} />
        {!missing && <InstrumentNav symbol={symbol} active="overview" isStock={quote ? quote.type === "STOCK" : true} />}
        {!missing && <PriceChart symbol={symbol} quote={quote} />}
        {!missing && <PerformanceStrip symbol={symbol} last={quote?.last ?? null} />}
        {isStock && (
          // Financials hides itself when Nasdaq has no statements; the source line shows only with the panel.
          <div className="hidden space-y-1.5 has-[section]:block">
            <Financials symbol={symbol} />
            <p className="px-1">
              <SourceTag provenance={{ source: "nasdaq", asOf: "", note: "Nasdaq.com (unofficial feed), statements as reported" }} />
            </p>
          </div>
        )}
        {quote && <NewsList query={newsQuery(symbol, quote.name)} title="News" limit={8} />}
      </div>
      <aside className="space-y-5">
        {quote && <KeyStats quote={quote} compact />}
        {isStock && <AnalystTarget symbol={symbol} last={quote?.last ?? null} decimals={quote?.decimals ?? 2} />}
        <WatchlistPanel activeSymbol={symbol} />
      </aside>
    </div>
  );
}
