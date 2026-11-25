import type { Provenance } from "@/lib/provenance";
import { normalizeTicker } from "@/lib/scanner/universe";
import type { ThesisResult } from "@/lib/scanner/thesis";
import { aiConfigured, aiKeyEnv, providerOfModel } from "@/lib/server/ai/client";
import { aiErrorToResponse, isAiError } from "@/lib/server/ai/errors";
import { payerScope, withVisitorKey } from "@/lib/server/ai/credentials";
import { badRequest, notConfigured, notFound, ok, upstream } from "@/lib/server/api";
import { aiAccess, guardOrLimit } from "@/lib/server/research/route-helpers";
import { peek, put } from "@/lib/server/cache";
import { ThesisInputError, buildThesis } from "@/lib/server/scanner/thesis";

export const dynamic = "force-dynamic";
/** Analyst with web search, then the scenario call: can take a minute or two. */
export const maxDuration = 300;

const MAX_BODY_CHARS = 500;
/** A thesis for the same ticker within this window is served from memory (its generatedAt shows its age). */
const THESIS_TTL_MS = 12 * 60 * 60_000;

async function readSymbol(req: Request): Promise<string | null> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY_CHARS) return null;
  try {
    const body = JSON.parse(text) as { symbol?: unknown };
    return typeof body.symbol === "string" ? normalizeTicker(body.symbol) : null;
  } catch {
    return null;
  }
}

function sourcesOf(t: ThesisResult): Provenance[] {
  const list: Provenance[] = [{ source: providerOfModel(t.model), asOf: t.generatedAt, note: `Model ${t.model}` }];
  if (t.price) list.push(t.price.provenance);
  if (t.dcfBase) list.push(t.dcfBase.provenance.revenueTTM);
  if (t.scenarios) list.push({ source: "model", asOf: t.generatedAt, note: "Fair values computed by the terminal's DCF from the AI's assumptions" });
  return list;
}

export async function POST(req: Request) {
  const symbol = await readSymbol(req);
  if (!symbol) return badRequest('Send JSON {"symbol": "AAPL"} with a valid US ticker.');
  const access = await aiAccess(req);
  if (!access.ok) return access.res;
  return withVisitorKey(access.key, () => thesisFor(req, symbol));
}

async function thesisFor(req: Request, symbol: string) {
  if (!aiConfigured()) {
    return notConfigured("Thesis generation needs an AI API key on the server. The screen itself works without it.", [aiKeyEnv()]);
  }
  // Split by who pays: a thesis made with the server's keys is never served to a visitor-key request.
  const key = `thesis:${payerScope()}:${symbol}`;
  const hit = peek<ThesisResult>(key, THESIS_TTL_MS);
  if (hit) return ok(hit, sourcesOf(hit));

  const limited = guardOrLimit(req);
  if (limited) return limited;
  try {
    const thesis = await buildThesis(symbol);
    put<ThesisResult>(key, thesis);
    return ok(thesis, sourcesOf(thesis));
  } catch (err) {
    if (err instanceof ThesisInputError) return notFound(`No screen data for ${symbol}: ${err.message}`);
    if (isAiError(err)) return aiErrorToResponse(err, "scanner.thesis");
    return upstream("scanner.thesis", err, "Company data could not be loaded right now. Try again shortly.");
  }
}
