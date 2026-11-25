import { badRequest, ok, upstream } from "@/lib/server/api";
import { fredMany, fredProvenance, isFredId, type FredSeries } from "@/lib/server/fred";

export const dynamic = "force-dynamic";

const MAX_IDS = 24;
const CACHE_SEC = 1800;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FredRouteSeries = { id: string; series: FredSeries | null; error: string | null };

/** GET /api/fred?ids=DGS10,DGS2&start=2024-01-01 -> keyless FRED series with provenance. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const start = params.get("start") ?? undefined;
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every(isFredId)) {
    return badRequest(`Pass 1-${MAX_IDS} FRED series ids, e.g. /api/fred?ids=DGS10,DGS2.`);
  }
  if (start && !DATE_RE.test(start)) return badRequest("start must be YYYY-MM-DD.");
  try {
    const results = await fredMany(ids, { start });
    if (results.every((r) => !r.series)) return upstream("fred", new Error(results.map((r) => r.error).join("; ")), "FRED is unavailable right now.");
    const sources = results.flatMap((r) => (r.series ? [fredProvenance(r.series)] : []));
    return ok<FredRouteSeries[]>(results, sources, CACHE_SEC);
  } catch (err) {
    return upstream("fred", err, "FRED is unavailable right now.");
  }
}
