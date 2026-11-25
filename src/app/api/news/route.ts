import { fail, json, upstreamFailure } from "@/lib/server/http";
import { marketNews, symbolNews } from "@/lib/server/news";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length > 80 || (q && !/^[\p{L}\p{N} .&,\-']+$/u.test(q))) return fail(400, "Invalid news query.");
  try {
    return json({ items: q ? await symbolNews(q) : await marketNews() });
  } catch (err) {
    return upstreamFailure("news", err);
  }
}
