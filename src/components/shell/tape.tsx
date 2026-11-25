"use client";

import Link from "next/link";
import { useQuotes } from "@/lib/client/quote-store";
import { TAPE, quoteHref, shortName } from "@/lib/instruments";
import { Change } from "@/components/ui/change";
import { Price } from "@/components/ui/price";
import { instrumentSession } from "@/lib/market-session";
import { SESSION_LABEL } from "@/lib/provenance";

export function Tape() {
  const quotes = useQuotes(TAPE);
  return (
    <div className="border-b border-line bg-surface">
      <div className="no-scrollbar mx-auto flex w-full max-w-[1440px] overflow-x-auto px-2 sm:px-4 lg:px-6">
        {TAPE.map((s) => {
          const q = quotes[s];
          const session = q ? instrumentSession(q, new Date()) : null;
          const live = session === "regular" || session === "continuous";
          const title = q && session ? [shortName(s), SESSION_LABEL[session], q.delayed ? "Delayed" : ""].filter(Boolean).join(" · ") : undefined;
          return (
            <Link
              key={s}
              href={quoteHref(s)}
              title={title}
              className="flex shrink-0 items-baseline gap-2 border-r border-line px-3 py-2 text-[12.5px] transition-colors last:border-r-0 hover:bg-hover"
            >
              <span className="font-medium text-muted">{shortName(s)}</span>
              {q ? (
                <>
                  <Price value={q.last} decimals={q.decimals} isYield={q.isYield} className={live ? "font-medium" : "font-medium text-muted"} />
                  <Change pct={q.changePct} />
                </>
              ) : (
                <span className="skeleton inline-block h-3.5 w-24 self-center" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
