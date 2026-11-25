import type { Provenance } from "@/lib/provenance";
import { cached } from "./cache";

/**
 * FRED series via the keyless CSV endpoint (one series per request). Missing observations ("." or
 * empty) are dropped, never filled.
 */

const CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const SERIES_URL = "https://fred.stlouisfed.org/series";
const ID_RE = /^[A-Z0-9_]{2,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TTL_MS = 3_600_000;
const TIMEOUT_MS = 12_000;
const MAX_CONCURRENT = 4;
const UA = "MarketTerminal/2.0 (research app)";

export type FredPoint = { date: string; value: number };
export type FredSeries = { id: string; points: FredPoint[]; last: FredPoint; url: string };

/** Thrown for invalid ids (`bad_request`), unknown series (`not_found`) and transport failures (`upstream`). */
export class FredError extends Error {
  constructor(message: string, readonly code: "bad_request" | "not_found" | "upstream") {
    super(message);
    this.name = "FredError";
  }
}

export function isFredId(id: string): boolean {
  return ID_RE.test(id);
}

export function fredSeriesUrl(id: string): string {
  return `${SERIES_URL}/${id}`;
}

/** Parses fredgraph.csv for one series. Returns null when the body is not that series' CSV. */
export function parseFredCsv(csv: string, id: string): FredPoint[] | null {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  if (!header || header.length < 2 || header[1].toUpperCase() !== id) return null;
  const points: FredPoint[] = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!DATE_RE.test(date ?? "") || !raw || raw === ".") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) points.push({ date, value });
  }
  return points;
}

async function download(id: string, start: string | undefined): Promise<string> {
  const params = new URLSearchParams({ id });
  if (start) params.set("cosd", start);
  let res: Response;
  try {
    res = await fetch(`${CSV_URL}?${params}`, {
      headers: { "User-Agent": UA, Accept: "text/csv" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FredError(`FRED request failed: ${err instanceof Error ? err.message : String(err)}`, "upstream");
  }
  if (res.status === 404) throw new FredError(`FRED series ${id} not found`, "not_found");
  if (!res.ok) throw new FredError(`FRED responded ${res.status}`, "upstream");
  return res.text();
}

export async function fredSeries(id: string, opts: { start?: string } = {}): Promise<FredSeries> {
  const sid = id.trim().toUpperCase();
  if (!isFredId(sid)) throw new FredError(`Invalid FRED series id: ${id}`, "bad_request");
  if (opts.start !== undefined && !DATE_RE.test(opts.start)) throw new FredError("start must be YYYY-MM-DD", "bad_request");
  return cached(`fred:${sid}:${opts.start ?? ""}`, TTL_MS, async () => {
    const csv = await download(sid, opts.start);
    const points = parseFredCsv(csv, sid);
    // FRED answers unknown ids with an HTML page, not a 404.
    if (points === null) throw new FredError(`FRED series ${sid} not found`, "not_found");
    const last = points.at(-1);
    if (!last) throw new FredError(`FRED series ${sid} has no observations in range`, "not_found");
    return { id: sid, points, last, url: fredSeriesUrl(sid) };
  });
}

export type FredManyResult = { id: string; series: FredSeries | null; error: string | null };

/** Several series, at most 4 requests at a time. One failing series does not fail the others. */
export async function fredMany(ids: string[], opts: { start?: string } = {}): Promise<FredManyResult[]> {
  const unique = [...new Set(ids.map((i) => i.trim().toUpperCase()))];
  const results: FredManyResult[] = new Array(unique.length);
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const i = next++;
      const id = unique[i];
      try {
        results[i] = { id, series: await fredSeries(id, opts), error: null };
      } catch (err) {
        results[i] = { id, series: null, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, unique.length) }, worker));
  return results;
}

/** Provenance for the latest observation of a series. */
export function fredProvenance(series: Pick<FredSeries, "id" | "last" | "url">): Provenance {
  return { source: "fred", asOf: series.last.date, session: "n/a", url: series.url, note: `FRED series ${series.id}` };
}
