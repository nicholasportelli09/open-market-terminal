"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi, type ApiState } from "@/lib/client/use-api";
import { startYearsBack, type Point } from "@/lib/macro/math";
import { buildReading, type Reading } from "@/lib/macro/readings";
import { GROUPS, type GroupId } from "@/lib/macro/series";
import type { ChartPayload } from "@/lib/types";

/** One entry of the /api/fred response (see src/app/api/fred/route.ts). */
export type FredItem = { id: string; series: { id: string; points: Point[]; last: Point; url: string } | null; error: string | null };

export type GroupState = ApiState<FredItem[]>;

const FRED_REFRESH_MS = 30 * 60_000;
const HISTORY_REFRESH_MS = 10 * 60_000;

function groupUrl(id: GroupId, today: Date): string {
  const g = GROUPS.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown macro group ${id}`);
  return `/api/fred?ids=${g.ids.join(",")}&start=${startYearsBack(today, g.yearsBack)}`;
}

/** The six FRED groups, one request each, refreshed every 30 minutes. */
export function useFredGroups(): Record<GroupId, GroupState> {
  const today = useMemo(() => new Date(), []);
  const opts = { intervalMs: FRED_REFRESH_MS };
  const central = useApi<FredItem[]>(groupUrl("central", today), opts);
  const curve = useApi<FredItem[]>(groupUrl("curve", today), opts);
  const real = useApi<FredItem[]>(groupUrl("real", today), opts);
  const labor = useApi<FredItem[]>(groupUrl("labor", today), opts);
  const credit = useApi<FredItem[]>(groupUrl("credit", today), opts);
  const risk = useApi<FredItem[]>(groupUrl("risk", today), opts);
  return { central, curve, real, labor, credit, risk };
}

export type SeriesSlot = { reading: Reading | null; error: string | null; raw: Point[] | null };

/** Reading (or the reason there is none) for every series of every loaded group. */
function slotsFor(lists: (FredItem[] | null)[]): Map<string, SeriesSlot> {
  const out = new Map<string, SeriesSlot>();
  for (const items of lists) {
    for (const item of items ?? []) {
      const raw = item.series?.points ?? null;
      const reading = buildReading(item.id, raw);
      const error = item.error ?? (reading ? null : "No usable observations");
      out.set(item.id, { reading, error, raw });
    }
  }
  return out;
}

export function useSeriesMap(groups: Record<GroupId, GroupState>): Map<string, SeriesSlot> {
  const { central, curve, real, labor, credit, risk } = groups;
  return useMemo(
    () => slotsFor([central.data, curve.data, real.data, labor.data, credit.data, risk.data]),
    [central.data, curve.data, real.data, labor.data, credit.data, risk.data],
  );
}

export type History = { status: "loading" | "ok" | "error"; points: Point[]; error?: string };

/** Bar time is exchange wall-clock time encoded as UTC seconds, so the UTC date is the local date. */
function toPoints(payload: ChartPayload): Point[] {
  const byDate = new Map<string, number>();
  for (const b of payload.bars) byDate.set(new Date(b.t * 1000).toISOString().slice(0, 10), b.c);
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

async function loadHistory(symbol: string, signal: AbortSignal): Promise<History> {
  try {
    const res = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=1Y`, { signal, cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok || !body || !Array.isArray((body as ChartPayload).bars)) {
      const msg = (body as { error?: string } | null)?.error ?? `History request failed (HTTP ${res.status})`;
      return { status: "error", points: [], error: msg };
    }
    return { status: "ok", points: toPoints(body as ChartPayload) };
  } catch (err) {
    if (signal.aborted) throw err;
    return { status: "error", points: [], error: err instanceof Error ? err.message : "History request failed" };
  }
}

/** Daily CNBC closes for the last year of each live instrument (for 1m / 1y changes and sparklines). */
export function useLiveHistory(symbols: readonly string[]): Record<string, History> {
  const key = symbols.join(",");
  const [state, setState] = useState<Record<string, History>>({});
  useEffect(() => {
    const list = key.split(",").filter(Boolean);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      try {
        const results = await Promise.all(list.map((s) => loadHistory(s, controller.signal)));
        setState((prev) => {
          const next: Record<string, History> = {};
          list.forEach((s, i) => {
            const r = results[i];
            // Keep the last good history when a refresh fails.
            next[s] = r.status === "error" && prev[s]?.status === "ok" ? prev[s] : r;
          });
          return next;
        });
      } catch {
        return; // aborted on unmount
      }
      timer = setTimeout(run, HISTORY_REFRESH_MS);
    };
    void run();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key]);
  return state;
}
