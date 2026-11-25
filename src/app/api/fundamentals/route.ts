import { fail, isSymbol, json, upstreamFailure } from "@/lib/server/http";
import { financialStatements } from "@/lib/server/nasdaq";
import type { Fundamentals } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const symbol = params.get("symbol");
  const quarterly = params.get("period") === "quarterly";
  if (!isSymbol(symbol)) return fail(400, "Invalid symbol.");
  try {
    const statements = await financialStatements(symbol, quarterly);
    const body: Fundamentals = { statements };
    return json(body, 3_600);
  } catch (err) {
    return upstreamFailure("fundamentals", err);
  }
}
