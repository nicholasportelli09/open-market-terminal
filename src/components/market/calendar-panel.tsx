"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import { fmtCompact } from "@/lib/format";
import { quoteHref } from "@/lib/instruments";
import type { EarningsItem, EconEvent } from "@/lib/types";
import { Panel, Segmented } from "@/components/ui/panel";

const KINDS = [
  { id: "economic", label: "Economy" },
  { id: "earnings", label: "Earnings" },
] as const;
type Kind = (typeof KINDS)[number]["id"];
const REGIONS = [
  { id: "all", label: "All" },
  { id: "United States", label: "US" },
  { id: "Euro Zone", label: "Euro" },
  { id: "United Kingdom", label: "UK" },
  { id: "Japan", label: "Japan" },
  { id: "China", label: "China" },
] as const;
type Region = (typeof REGIONS)[number]["id"];
const DAY_MS = 86_400_000;
const REFRESH_MS = 5 * 60_000;
const EARNINGS_ROWS = 25;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday-to-Friday of the week to show (next week on weekends), in New York dates. */
function weekDays(offsetWeeks: number): Date[] {
  const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const base = Date.UTC(ny.getFullYear(), ny.getMonth(), ny.getDate());
  const dow = new Date(base).getUTCDay();
  const monday = base - ((dow + 6) % 7) * DAY_MS + (dow === 0 || dow === 6 ? 7 * DAY_MS : 0) + offsetWeeks * 7 * DAY_MS;
  return Array.from({ length: 5 }, (_, i) => new Date(monday + i * DAY_MS));
}

function todayInWeek(days: Date[]): string {
  const ny = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return days.some((d) => iso(d) === ny) ? ny : iso(days[0]);
}

function num(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return s && Number.isFinite(n) ? n : null;
}

/** Green when the release beat consensus, red when it missed (direction only, not "good or bad"). */
function beatClass(actual: string, consensus: string): string {
  const a = num(actual);
  const c = num(consensus);
  if (a == null || c == null || a === c) return "text-fg";
  return a > c ? "text-up" : "text-down";
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm || "—";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function EconomicList({ items, region }: { items: EconEvent[]; region: Region }) {
  const rows = region === "all" ? items : items.filter((e) => e.country === region);
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-[13px] text-muted">No releases scheduled.</p>;
  return (
    <table className="w-full min-w-[560px] text-[13px]">
      <thead>
        <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.06em] text-faint">
          <th scope="col" className="px-4 py-2 text-left font-medium">Time (ET)</th>
          <th scope="col" className="py-2 text-left font-medium">Event</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Actual</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Consensus</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Previous</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={`${e.time}-${e.event}-${i}`} className="border-b border-line last:border-0">
            <td className="num whitespace-nowrap px-4 py-2 text-muted">{clock(e.time)}</td>
            <td className="py-2 pr-2">
              <span className="text-fg">{e.event}</span>
              <span className="ml-2 text-[12px] text-faint">{e.country}</span>
            </td>
            <td className={`num px-3 py-2 text-right font-medium ${beatClass(e.actual, e.consensus)}`}>{e.actual || "—"}</td>
            <td className="num px-3 py-2 text-right text-muted">{e.consensus || "—"}</td>
            <td className="num px-4 py-2 text-right text-muted">{e.previous || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EarningsList({ items }: { items: EarningsItem[] }) {
  if (items.length === 0) return <p className="px-4 py-8 text-center text-[13px] text-muted">No earnings reports scheduled.</p>;
  return (
    <table className="w-full min-w-[520px] text-[13px]">
      <thead>
        <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.06em] text-faint">
          <th scope="col" className="px-4 py-2 text-left font-medium">Company</th>
          <th scope="col" className="px-3 py-2 text-left font-medium">When</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">EPS</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">Estimate</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Mkt cap</th>
        </tr>
      </thead>
      <tbody>
        {items.slice(0, EARNINGS_ROWS).map((r) => (
          <tr key={r.symbol} className="border-b border-line last:border-0 hover:bg-hover">
            <td className="max-w-[240px] px-4 py-2">
              <Link href={quoteHref(r.symbol)} className="flex min-w-0 items-baseline gap-2">
                <span className="num font-semibold text-fg">{r.symbol}</span>
                <span className="truncate text-[12px] text-faint">{r.name}</span>
              </Link>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-muted">{r.when === "pre" ? "Before open" : r.when === "post" ? "After close" : "—"}</td>
            <td className={`num px-3 py-2 text-right font-medium ${r.eps ? beatClass(r.eps, r.epsForecast) : "text-faint"}`}>
              {r.eps || "—"}
              {r.surprisePct != null && r.eps && <span className="ml-1 text-[11.5px] font-normal">({r.surprisePct > 0 ? "+" : ""}{r.surprisePct.toFixed(1)}%)</span>}
            </td>
            <td className="num px-3 py-2 text-right text-muted">{r.epsForecast || "—"}</td>
            <td className="num px-4 py-2 text-right text-muted">{r.marketCap ? `$${fmtCompact(r.marketCap)}` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Economic releases and earnings for one weekday, like OpenBB's calendar widgets. */
export function CalendarPanel() {
  const [kind, setKind] = useState<Kind>("economic");
  const [region, setRegion] = useState<Region>("all");
  const [week, setWeek] = useState(0);
  const days = useMemo(() => weekDays(week), [week]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && days.some((d) => iso(d) === picked) ? picked : todayInWeek(days);
  const { data, error } = useFetch<{ kind: Kind; date: string; items: (EconEvent | EarningsItem)[] }>(`/api/calendar?kind=${kind}&date=${date}`, REFRESH_MS);
  const current = data && data.kind === kind && data.date === date ? data : null;

  const shift = (n: number) => {
    setWeek((w) => Math.max(-2, Math.min(2, w + n)));
    setPicked(null);
  };
  const arrow = "grid h-8 w-7 shrink-0 cursor-pointer sm:w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-30";

  return (
    <Panel title="Calendar" action={<Segmented label="Calendar type" options={KINDS} value={kind} onChange={setKind} />}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <button type="button" className={arrow} onClick={() => shift(-1)} disabled={week <= -2} aria-label="Previous week">‹</button>
          <div role="tablist" aria-label="Day" className="no-scrollbar flex min-w-0 gap-0.5 overflow-x-auto">
            {days.map((d) => {
              const id = iso(d);
              const active = id === date;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPicked(id)}
                  className={`min-h-8 shrink-0 cursor-pointer rounded-md px-1.5 text-[12.5px] sm:px-2 font-medium leading-tight transition-colors ${active ? "bg-hover text-fg" : "text-muted hover:text-fg"}`}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                  <span className="num ml-1 text-faint">{d.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className={arrow} onClick={() => shift(1)} disabled={week >= 2} aria-label="Next week">›</button>
        </div>
        {kind === "economic" && <Segmented label="Region" options={REGIONS} value={region} onChange={setRegion} />}
      </div>
      <div className="max-h-[460px] overflow-auto">
        {!current && !error && <div className="skeleton m-4 h-32" />}
        {!current && error && <p className="px-4 py-8 text-center text-[13px] text-muted">The calendar is unavailable right now.</p>}
        {current && (kind === "economic" ? <EconomicList items={current.items as EconEvent[]} region={region} /> : <EarningsList items={current.items as EarningsItem[]} />)}
      </div>
    </Panel>
  );
}
