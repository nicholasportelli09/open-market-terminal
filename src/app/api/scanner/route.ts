import type { Provenance } from "@/lib/provenance";
import { MAX_EXTRA_TICKERS, cleanExtras, normalizeTicker } from "@/lib/scanner/universe";
import type { ScreenData } from "@/lib/scanner/types";
import { badRequest, ok, upstream } from "@/lib/server/api";
import { getScreen, screenProgress } from "@/lib/server/scanner/screen";

export const dynamic = "force-dynamic";
/** The first screen downloads SEC filings for ~100 companies under fair-access pacing (about a minute or two). */
export const maxDuration = 300;

const MAX_PARAM_CHARS = 400;

function parseExtras(param: string | null): string[] | string {
  if (!param) return [];
  if (param.length > MAX_PARAM_CHARS) return "The extra list is too long.";
  const raw = param.split(",").map((s) => s.trim()).filter(Boolean);
  if (raw.length > MAX_EXTRA_TICKERS) return `Add at most ${MAX_EXTRA_TICKERS} extra tickers.`;
  const bad = raw.filter((s) => !normalizeTicker(s));
  if (bad.length) return `Not a valid US ticker: ${bad.slice(0, 3).join(", ")}.`;
  return cleanExtras(raw);
}

function sourcesOf(data: ScreenData): Provenance[] {
  return [
    { source: "sec", asOf: data.computedAt, url: "https://www.sec.gov/edgar", note: "XBRL company facts and submissions" },
    { source: "cnbc", asOf: data.computedAt, url: "https://www.cnbc.com/markets/", note: "Quotes, daily closes, beta and event dates" },
    { source: "model", asOf: data.computedAt, note: "Derived ratios and risk figures" },
  ];
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const extras = parseExtras(params.get("extra"));
  if (typeof extras === "string") return badRequest(extras);
  if (params.get("progress") === "1") {
    const p = screenProgress(extras);
    return ok(p, [{ source: "model", asOf: new Date().toISOString(), note: "Screen build progress for this ticker list on this server instance" }]);
  }
  try {
    const data = await getScreen(extras);
    return ok(data, sourcesOf(data));
  } catch (err) {
    return upstream("scanner", err, "The screen could not be built right now. Try again shortly.");
  }
}
