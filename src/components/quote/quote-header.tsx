"use client";

import Link from "next/link";
import { useWatchlist } from "@/lib/client/watchlist";
import { classifyInstrument, instrumentSession, quoteStamp } from "@/lib/market-session";
import { displayTicker, hasShortName, shortName } from "@/lib/instruments";
import { direction, fmtChange, fmtDateKey, fmtNyStamp, fmtNyTime, fmtPct, fmtPrice } from "@/lib/format";
import type { PriceSession } from "@/lib/provenance";
import type { ExtendedQuote, Quote } from "@/lib/types";
import { Price } from "@/components/ui/price";
import { Chip, SourceTag } from "@/components/ui/source-tag";
import { stockAnalysisUrl } from "@/lib/stockanalysis";

const EXT_LABEL: Record<string, string> = { PRE_MKT: "Pre-market", POST_MKT: "After hours" };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "At close · Fri, Nov 20, 4:00 PM ET", "Market hours · 11:32 AM ET", "24h market · 12:54 PM ET". */
function priceLine(q: Quote, session: PriceSession, now: Date): string {
  const stamp = quoteStamp(q, now);
  // Korean shares: Naver's price during Nextrade's pre- and after-market is that session's price.
  if (q.source === "naver" && (session === "pre" || session === "post")) {
    const label = session === "pre" ? "Pre-market (Nextrade)" : "After hours (Nextrade)";
    return stamp?.at ? `${label} · ${fmtNyTime(stamp.at)}` : label;
  }
  if (session === "regular" || session === "continuous") {
    const label = session === "regular" ? "Market hours" : "24h market";
    return stamp?.at ? `${label} · ${fmtNyTime(stamp.at)}` : label;
  }
  if (!stamp) return "At close";
  return `At close · ${stamp.at ? fmtNyStamp(stamp.at) : fmtDateKey(stamp.dateKey)}`;
}

function extStamp(ext: ExtendedQuote): string {
  if (!ext.time) return "";
  if (DATE_ONLY.test(ext.time)) return fmtDateKey(ext.time);
  const t = Date.parse(ext.time);
  return Number.isFinite(t) ? fmtNyStamp(new Date(t)) : "";
}

/**
 * The extended-hours price worth showing: pre-market only while pre-market runs; after-hours from the
 * close until the next regular open, and only when it is not older than the regular close it follows.
 */
function visibleExtended(q: Quote, session: PriceSession): ExtendedQuote | null {
  const ext = q.extended;
  if (!ext || ext.last == null || !EXT_LABEL[ext.type] || classifyInstrument(q) !== "us-equity") return null;
  if (session === "regular") return null;
  if (ext.type === "PRE_MKT") return session === "pre" ? ext : null;
  const extDay = ext.time?.slice(0, 10) ?? "";
  const mainDay = q.time?.slice(0, 10) ?? "";
  return extDay && mainDay && extDay < mainDay ? null : ext;
}

function toneOf(n: number | null | undefined): string {
  const dir = direction(n);
  return dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-muted";
}

function QuotePrice({ quote }: { quote: Quote }) {
  const now = new Date();
  const session = instrumentSession(quote, now);
  const ext = visibleExtended(quote, session);
  const color = toneOf(quote.changePct ?? quote.change);
  const typeLabel = quote.type ? quote.type.charAt(0) + quote.type.slice(1).toLowerCase() : "";
  const meta = [quote.isYield ? "" : quote.currency, typeLabel].filter(Boolean);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Price value={quote.last} decimals={quote.decimals} isYield={quote.isYield} className="text-[38px] font-semibold leading-none tracking-tight" />
        <span className={`num text-[17px] font-medium ${color}`}>
          {fmtChange(quote.change, quote.decimals, quote.isYield)} ({fmtPct(quote.changePct)})
        </span>
        <span className="text-[13.5px] text-muted">{priceLine(quote, session, now)}</span>
      </div>
      {ext && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px]">
          <span className="font-medium text-muted">{EXT_LABEL[ext.type]}</span>
          <span className="num font-medium">{fmtPrice(ext.last, quote.decimals)}</span>
          <span className={`num font-medium ${toneOf(ext.changePct ?? ext.change)}`}>
            {fmtChange(ext.change, quote.decimals)} ({fmtPct(ext.changePct)})
          </span>
          {extStamp(ext) && <span className="text-[12.5px] text-faint">· {extStamp(ext)}</span>}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint">
        {quote.delayed && <Chip title="CNBC marks this quote as delayed, not real-time">Delayed</Chip>}
        {meta.length > 0 && <span>{meta.join(" · ")} ·</span>}
        <SourceTag provenance={{ source: quote.source ?? "cnbc", asOf: "" }} />
      </p>
    </>
  );
}

export function QuoteHeader({ symbol, quote, missing }: { symbol: string; quote?: Quote; missing: boolean }) {
  const { has, toggle } = useWatchlist();
  const watching = has(symbol);
  const name = hasShortName(symbol) ? shortName(symbol) : quote?.name ?? displayTicker(symbol);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
          <Link href="/" className="hover:text-fg">Markets</Link>
          <span className="text-faint">/</span>
          <span className="num">{displayTicker(symbol)}</span>
          {quote?.exchange && <span className="text-faint">· {quote.exchange}</span>}
        </nav>
        <h1 className="truncate text-[26px] font-semibold tracking-tight sm:text-[30px]">{missing ? displayTicker(symbol) : name}</h1>
        {missing ? (
          <p className="mt-2 text-[14px] text-muted">No quote found for this symbol. Try the search above.</p>
        ) : quote ? (
          <QuotePrice quote={quote} />
        ) : (
          <div className="mt-3 space-y-2">
            <div className="skeleton h-10 w-56" />
            <div className="skeleton h-4 w-40" />
          </div>
        )}
      </div>
      {!missing && (
        <div className="flex flex-wrap items-center gap-2">
          {quote && <StockAnalysisLink quote={quote} />}
          <WatchButton watching={watching} onToggle={() => toggle(symbol)} />
        </div>
      )}
    </div>
  );
}

function StockAnalysisLink({ quote }: { quote: Quote }) {
  const href = stockAnalysisUrl(quote);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-10 items-center gap-1.5 rounded-xl border border-line px-4 text-[13.5px] font-medium text-fg transition-colors hover:bg-hover"
    >
      Stock Analysis
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M7 17 17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">(opens stockanalysis.com in a new tab)</span>
    </a>
  );
}

function WatchButton({ watching, onToggle }: { watching: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={watching}
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-[13.5px] font-medium transition-colors ${
        watching ? "border-line bg-hover text-fg" : "border-fg bg-fg text-bg hover:opacity-90"
      }`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill={watching ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" strokeLinejoin="round" />
      </svg>
      {watching ? "Watching" : "Watch"}
    </button>
  );
}
