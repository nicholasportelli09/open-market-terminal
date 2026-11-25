import { searchSymbols } from "@/lib/server/symbol-search";
import { fail, json, upstreamFailure } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return json({ results: [] });
  if (q.length > 40 || !/^[\p{L}\p{N} .:&@=\-^']+$/u.test(q)) return fail(400, "Invalid search.");
  try {
    return json({ results: await searchSymbols(q) });
  } catch (err) {
    return upstreamFailure("search", err);
  }
}
