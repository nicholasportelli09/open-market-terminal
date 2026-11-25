"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuotes } from "@/lib/client/quote-store";
import { MOVERS_UNIVERSE, quoteHref } from "@/lib/instruments";
import { fmtCompact, fmtDateKey, fmtNyStamp } from "@/lib/format";
import { instrumentSession, quoteStamp } from "@/lib/market-session";
import type { Quote } from "@/lib/types";
import { Change } from "@/components/ui/change";
import { Panel, Segmented } from "@/components/ui/panel";
import { Price } from "@/components/ui/price";
import { SourceTag } from "@/components/ui/source-tag";

const VIEWS = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "active", label: "Most active" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const ROWS = 8;

/** Quotes without the figure being ranked are left out rather than ranked as zero. */
function rank(quotes: Quote[], view: View): Quote[] {
  const dollarVolume = (q: Quote) => (q.volume ?? 0) * (q.last ?? 0);
  const usable = quotes.filter((q) => (view === "active" ? q.volume != null && q.last != null : q.changePct != null));
  const sorted = usable.sort((a, b) => {
    if (view === "active") return dollarVolume(b) - dollarVolume(a);
    const d = (b.changePct as number) - (a.changePct as number);
    return view === "gainers" ? d : -d;
  });
  return sorted.slice(0, ROWS);
}

/** "At close Fri, Nov 20, 4:00 PM ET" when the US market is not in its regular session. */
function sessionNote(quotes: Quote[], now: Date): string {
  const q = quotes[0];
  if (!q || instrumentSession(q, now) === "regular") return "";
  const stamp = quoteStamp(q, now);
  if (!stamp) return "At close";
  return `At close ${stamp.at ? fmtNyStamp(stamp.at) : fmtDateKey(stamp.dateKey)}`;
}

export function Movers() {
  const [view, setView] = useState<View>("gainers");
  const map = useQuotes(MOVERS_UNIVERSE);
  const all = Object.values(map).filter((q): q is Quote => !!q);
  const rows = rank(all, view);
  const note = sessionNote(all, new Date());

  return (
    <Panel title="Movers" action={<Segmented label="Movers view" options={VIEWS} value={view} onChange={setView} />}>
      <ul>
        {rows.length === 0 &&
          Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className="border-b border-line px-4 py-3 last:border-0"><div className="skeleton h-4 w-full" /></li>
          ))}
        {rows.map((q) => (
          <li key={q.symbol} className="border-b border-line last:border-0">
            <Link href={quoteHref(q.symbol)} className="grid grid-cols-[64px_minmax(0,1fr)_auto_76px] items-center gap-3 px-4 py-2.5 text-[13.5px] transition-colors hover:bg-hover sm:grid-cols-[64px_minmax(0,1fr)_auto_76px_56px]">
              <span className="num font-semibold">{q.symbol}</span>
              <span className="truncate text-muted">{q.name}</span>
              <Price value={q.last} decimals={q.decimals} className="text-right" />
              <Change pct={q.changePct} variant="pill" />
              <span className="num hidden text-right text-faint sm:block">{fmtCompact(q.volume)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-[11.5px] text-faint">From 50 large-cap US stocks{note && <> · {note}</>} · <SourceTag provenance={{ source: "cnbc", asOf: "" }} /></p>
    </Panel>
  );
}
