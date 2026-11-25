import { analystData } from "@/lib/server/analyst";
import { badRequest, notConfigured, ok, rateLimited, upstream } from "@/lib/server/api";
import { providerStatus } from "@/lib/server/config";
import { isSymbol } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Edge cache for complete answers; partial answers (some section failed) are not cached. */
const CACHE_SEC = 3_600;

/** GET /api/analyst?symbol=AAPL -> ApiResult<AnalystData>. Licensed providers only (FMP, Finnhub). */
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase() ?? null;
  if (!isSymbol(symbol)) return badRequest("Pass a stock symbol, e.g. ?symbol=AAPL.");

  const status = providerStatus();
  if (!status.fmp && !status.finnhub) {
    return notConfigured(
      "Analyst ratings and price targets come from Financial Modeling Prep (licensed). FINNHUB_API_KEY is optional and only adds monthly recommendation trends.",
      ["FMP_API_KEY"],
    );
  }

  try {
    const { data, sources } = await analystData(symbol);
    const hasData = !!(data.consensus || data.targets || data.distribution || data.history);
    const failures = data.issues.filter((i) => i.kind !== "not_configured");
    if (!hasData && failures.length > 0 && failures.every((i) => i.kind === "rate_limit")) {
      return rateLimited(failures[0].message, 60);
    }
    return ok(data, sources, failures.length === 0 ? CACHE_SEC : 0);
  } catch (err) {
    return upstream("analyst", err);
  }
}
