import { fetchChart } from "@/lib/server/cnbc";
import { fail, isSymbol, json, upstreamFailure } from "@/lib/server/http";
import type { Bar, Performance } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY = 86_400;
const HOUR_MS = 3_600_000;

/** Close of the last bar on or before t. */
function closeAt(bars: Bar[], t: number): number | null {
  let found: number | null = null;
  for (const b of bars) {
    if (b.t > t) break;
    found = b.c;
  }
  return found;
}

function monthsBack(t: number, months: number): number {
  const d = new Date(t * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate()) / 1000;
}

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!isSymbol(symbol)) return fail(400, "Invalid symbol.");
  try {
    const [daily, weekly] = await Promise.all([fetchChart(symbol, "1Y", HOUR_MS), fetchChart(symbol, "5Y", 6 * HOUR_MS)]);
    const last = daily.bars[daily.bars.length - 1];
    if (!last) return json<Performance>({ symbol, bases: [] }, 600);
    const yearStart = Date.UTC(new Date(last.t * 1000).getUTCFullYear(), 0, 1) / 1000;
    const points: [string, Bar[], number][] = [
      ["1W", daily.bars, last.t - 7 * DAY],
      ["1M", daily.bars, monthsBack(last.t, 1)],
      ["3M", daily.bars, monthsBack(last.t, 3)],
      ["6M", daily.bars, monthsBack(last.t, 6)],
      ["YTD", daily.bars, yearStart - 1],
      ["1Y", daily.bars, monthsBack(last.t, 12)],
      ["5Y", weekly.bars, monthsBack(last.t, 60)],
    ];
    const bases = points
      .map(([label, bars, t]) => ({ label, close: bars[0] && bars[0].t <= t ? closeAt(bars, t) : null }))
      .filter((b): b is { label: string; close: number } => b.close != null && b.close > 0);
    return json<Performance>({ symbol, bases }, 600);
  } catch (err) {
    return upstreamFailure("performance", err);
  }
}
