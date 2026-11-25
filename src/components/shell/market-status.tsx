"use client";

import { useEffect, useState } from "react";
import { useFeedStatus } from "@/lib/client/quote-store";
import { usEquitySession, type UsEquitySession } from "@/lib/market-session";
import { fmtOpensAt } from "@/lib/format";

const TICK_MS = 1000;

type View = { label: string; detail: string; open: boolean };

/** Status text from the NYSE calendar, not CNBC's curmktstatus (which says REG_MKT on Saturdays). */
export function describeSession(s: UsEquitySession, now: Date): View {
  const opens = s.opensAt ? fmtOpensAt(s.opensAt, now) : "";
  const early = s.earlyClose ? "Early close 1:00 PM" : "";
  switch (s.session) {
    case "regular":
      return { label: s.earlyClose ? "Open · Early close 1:00 PM" : "US market open", detail: "", open: true };
    case "pre":
      return { label: "Pre-market", detail: [early, opens].filter(Boolean).join(" · "), open: false };
    case "post":
      return { label: "After hours", detail: opens, open: false };
    default:
      if (s.reason === "weekend") return { label: "US market closed · Weekend", detail: opens, open: false };
      if (s.reason === "holiday") return { label: `Closed · ${s.holidayName ?? "Holiday"}`, detail: opens, open: false };
      return { label: "US market closed", detail: opens, open: false };
  }
}

function nyClock(now: Date): string {
  return now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** Ticks once a second on the client; null during SSR so server and client markup match. */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * US market status and the New York clock.
 * full: header, with the clock (not at xl, where the inline nav needs the room); next-open text where the header has room (lg, 2xl), else in the tooltip.
 * compact: nav row on tablets, label only (next-open text in the tooltip), no clock.
 */
export function MarketStatus({ variant = "full", className = "" }: { variant?: "full" | "compact"; className?: string }) {
  const { status } = useFeedStatus();
  const now = useNow();
  const view = now ? describeSession(usEquitySession(now), now) : null;
  const feedDown = status === "error";
  const dot = feedDown ? "bg-down" : view?.open ? "bg-up" : "bg-faint";
  const label = feedDown ? "Reconnecting…" : view?.label ?? "";

  return (
    <div className={`items-center gap-3 text-[12.5px] text-muted ${className}`}>
      <span className="flex items-center gap-2 whitespace-nowrap" aria-live="polite" title={view?.detail || undefined}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot} ${view?.open && !feedDown ? "live-dot" : ""}`} />
        {label || <span className="skeleton inline-block h-3 w-28" />}
      </span>
      {variant === "full" && view?.detail && !feedDown && (
        <span className={`hidden whitespace-nowrap text-faint ${"lg:inline xl:hidden 2xl:inline"}`}>{view.detail}</span>
      )}
      {variant === "full" && <span className="num whitespace-nowrap text-faint xl:hidden 2xl:inline">NY {now ? nyClock(now) : ""}</span>}
    </div>
  );
}
