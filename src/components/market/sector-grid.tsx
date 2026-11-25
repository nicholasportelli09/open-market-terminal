"use client";

import Link from "next/link";
import { useQuotes } from "@/lib/client/quote-store";
import { SECTORS, quoteHref } from "@/lib/instruments";
import { fmtPct } from "@/lib/format";
import { Panel } from "@/components/ui/panel";

const FULL_SCALE_PCT = 3;

function tint(pct: number | null | undefined): string {
  if (pct == null) return "transparent";
  const strength = Math.min(Math.abs(pct) / FULL_SCALE_PCT, 1);
  const alpha = 0.06 + strength * 0.3;
  const base = pct >= 0 ? "var(--up)" : "var(--down)";
  return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`;
}

export function SectorGrid() {
  const quotes = useQuotes(SECTORS.map((s) => s.symbol));
  return (
    <Panel title="US sectors" action={<span className="text-[12px] text-faint">SPDR sector ETFs</span>}>
      <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-4 lg:grid-cols-6">
        {SECTORS.map(({ symbol, label }) => {
          const q = quotes[symbol];
          return (
            <Link
              key={symbol}
              href={quoteHref(symbol)}
              style={{ backgroundColor: tint(q?.changePct) }}
              className="flex flex-col rounded-xl border border-line px-3 py-2.5 transition-colors hover:border-line-strong"
            >
              <span className="truncate text-[12.5px] font-medium">{label}</span>
              <span className={`num mt-0.5 text-[14px] font-semibold ${q?.changePct == null ? "text-faint" : q.changePct >= 0 ? "text-up" : "text-down"}`}>
                {q ? fmtPct(q.changePct) : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
