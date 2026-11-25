import { RANGE_SOURCE, shapeChart } from "@/lib/server/bars";
import { fetchChart } from "@/lib/server/cnbc";
import { fail, isSymbol, json, upstreamFailure } from "@/lib/server/http";
import { RANGES, type Range } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const symbol = params.get("symbol");
  const range = (params.get("range") ?? "1D") as Range;
  if (!isSymbol(symbol)) return fail(400, "Invalid symbol.");
  if (!RANGES.includes(range)) return fail(400, `Range must be one of ${RANGES.join(", ")}.`);
  try {
    const { source, ttlMs } = RANGE_SOURCE[range];
    const raw = await fetchChart(symbol, source, ttlMs);
    return json(shapeChart(symbol, range, raw));
  } catch (err) {
    return upstreamFailure("chart", err);
  }
}
