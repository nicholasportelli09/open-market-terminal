"use client";

import { useApi } from "@/lib/client/use-api";
import type { ScreenProgress as Progress } from "@/lib/scanner/types";
import { UNIVERSE_NAME } from "@/lib/scanner/universe";

const POLL_MS = 1_500;

/** First-load explanation with live progress from /api/scanner?progress=1 (for this extras list) while the server builds the screen. */
export function ScreenProgress({ extraTickers }: { extraTickers: string[] }) {
  const extras = extraTickers.length;
  const query = extras ? `&extra=${encodeURIComponent(extraTickers.join(","))}` : "";
  const p = useApi<Progress>(`/api/scanner?progress=1${query}`, { intervalMs: POLL_MS });
  const prog = p.data;
  const total = prog?.running ? prog.total : 0;
  const done = prog?.running ? prog.done : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <p className="text-[14px] font-medium">Building the screen</p>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">
        The server reads the latest SEC filings, one year of daily prices and the event calendar for every {UNIVERSE_NAME} company
        {extras > 0 ? ` plus your ${extras} added ticker${extras === 1 ? "" : "s"}` : ""}, at the pace the SEC allows. The first load takes
        about half a minute to two minutes; after that the result is cached on the server for six hours.
      </p>
      <div className="mt-4 h-1.5 max-w-md overflow-hidden rounded-full bg-hover" aria-hidden>
        <div className="h-full rounded-full bg-fg/70 transition-[width] duration-500" style={{ width: `${total > 0 ? Math.max(2, pct) : 0}%` }} />
      </div>
      <p className="num mt-2 text-[12px] text-faint">
        {total > 0 ? `${done} of ${total} companies${prog && prog.failed > 0 ? ` · ${prog.failed} could not be screened` : ""}` : "Starting..."}
      </p>
    </div>
  );
}
