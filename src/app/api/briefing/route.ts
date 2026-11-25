import { aiErrorToResponse } from "@/lib/server/ai/errors";
import { withVisitorKey } from "@/lib/server/ai/credentials";
import { badRequest, ok, rateLimited } from "@/lib/server/api";
import { briefingKey, cachedBriefing, generateBriefing } from "@/lib/server/research/briefing";
import { BRIEFING_MIN_REFRESH_MS } from "@/lib/server/research/briefing-core";
import { aiAccess, aiNotConfigured, guardOrLimit, readJson } from "@/lib/server/research/route-helpers";
import type { Briefing, BriefingRequest } from "@/lib/server/research/types";
import { parseBriefingRequest } from "@/lib/server/research/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/briefing {portfolio?, refresh?} -> ApiResult<Briefing>.
 * Served from a 3-hour in-memory cache per (market date, portfolio). Cache hits skip the AI rate guard;
 * a new generation always goes through it, and refresh=true is refused while the cached copy is under 20 min old.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = parseBriefingRequest(body.body);
  if (!parsed.ok) return badRequest(parsed.error);
  const access = await aiAccess(req);
  if (!access.ok) return access.res;
  const value = parsed.value;
  return withVisitorKey(access.key, async () => {
    const unconfigured = aiNotConfigured("The daily briefing is written by AI and needs an AI API key on the server.");
    if (unconfigured) return unconfigured;
    return brief(req, value);
  });
}

async function brief(req: Request, value: BriefingRequest) {
  const key = briefingKey(value.portfolio);
  const hit = cachedBriefing(key);
  if (hit && !value.refresh) return ok<Briefing>(hit.briefing, hit.sources);
  if (hit) {
    // Cost guard: a forced refresh of a recent briefing is refused instead of paying for a new one.
    const ageMs = Date.now() - Date.parse(hit.briefing.generatedAt);
    if (ageMs < BRIEFING_MIN_REFRESH_MS) {
      const waitSec = Math.ceil((BRIEFING_MIN_REFRESH_MS - ageMs) / 1000);
      return rateLimited(
        `This briefing is ${Math.max(1, Math.round(ageMs / 60_000))} min old. To keep AI costs low it can be refreshed again in ${Math.ceil(waitSec / 60)} min.`,
        waitSec,
      );
    }
  }
  const limited = guardOrLimit(req);
  if (limited) return limited;
  try {
    const { briefing, sources } = await generateBriefing(key, value.portfolio);
    return ok<Briefing>(briefing, sources);
  } catch (err) {
    return aiErrorToResponse(err, "briefing");
  }
}
