import type { AnalystAnswer } from "@/lib/ai/types";
import type { Provenance } from "@/lib/provenance";
import { aiErrorToResponse } from "@/lib/server/ai/errors";
import { payerScope, withVisitorKey } from "@/lib/server/ai/credentials";
import { badRequest, ok } from "@/lib/server/api";
import { peek, put } from "@/lib/server/cache";
import { runResearch } from "@/lib/server/research/research";
import { aiAccess, aiNotConfigured, guardOrLimit, readJson } from "@/lib/server/research/route-helpers";
import type { ResearchRequest } from "@/lib/server/research/types";
import { parseResearchRequest } from "@/lib/server/research/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Identical questions within this window are answered from memory instead of paying for a new answer. */
const ANSWER_TTL_MS = 60 * 60_000;

type Cached = { answer: AnalystAnswer; sources: Provenance[] };

/**
 * POST /api/research {mode, symbols[], question, thesis?, window?, portfolio?} -> ApiResult<AnalystAnswer>.
 * Repeats of the same request within an hour are served from memory and skip the AI rate guard.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = parseResearchRequest(body.body);
  if (!parsed.ok) return badRequest(parsed.error);
  const access = await aiAccess(req);
  if (!access.ok) return access.res;
  return withVisitorKey(access.key, async () => {
    const unconfigured = aiNotConfigured();
    if (unconfigured) return unconfigured;
    return answer(req, parsed.value);
  });
}

async function answer(req: Request, value: ResearchRequest) {
  // The validator builds the request with a fixed key order, so its JSON is a stable cache key; split by who pays.
  const key = `research:${payerScope()}:${JSON.stringify(value)}`;
  const hit = peek<Cached>(key, ANSWER_TTL_MS);
  if (hit) return ok<AnalystAnswer>(hit.answer, hit.sources);

  const limited = guardOrLimit(req);
  if (limited) return limited;
  try {
    const result = await runResearch(value, req.signal);
    put<Cached>(key, result);
    return ok<AnalystAnswer>(result.answer, result.sources);
  } catch (err) {
    return aiErrorToResponse(err, "research");
  }
}
