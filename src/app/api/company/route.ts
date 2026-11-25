import type { CompanySnapshot } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";
import { badRequest, notFound, ok, rateLimited, upstream } from "@/lib/server/api";
import { companySnapshot } from "@/lib/server/company";
import { isSymbol } from "@/lib/server/http";
import { SecError } from "@/lib/server/sec";

export const dynamic = "force-dynamic";

const CACHE_SEC = 600;

/** One provenance entry per distinct source record behind the snapshot (filings, quote). */
function collectSources(s: CompanySnapshot): Provenance[] {
  const seen = new Map<string, Provenance>();
  for (const m of [s.price, ...Object.values(s.metrics)]) {
    const p = m.provenance;
    if (m.value === null || p.source === "model") continue;
    const key = `${p.source}|${p.url ?? ""}|${p.asOf}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim() ?? null;
  if (!isSymbol(symbol)) return badRequest("Pass a valid ticker, e.g. /api/company?symbol=AAPL.");
  try {
    const result = await companySnapshot(symbol);
    if (result.kind === "not_found") return notFound(result.message);
    if (result.kind === "unsupported") return notFound(`Fundamentals unavailable: ${result.message}`);
    return ok(result.snapshot, collectSources(result.snapshot), CACHE_SEC);
  } catch (err) {
    if (err instanceof SecError && err.status === 429) return rateLimited("SEC rate limit reached. Try again in a minute.", 60);
    return upstream("company", err, "SEC EDGAR is unavailable right now. Try again shortly.");
  }
}
