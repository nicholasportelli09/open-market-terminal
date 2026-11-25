import { fetchQuotes } from "@/lib/server/cnbc";
import { fail, json, parseSymbols, upstreamFailure } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const symbols = parseSymbols(new URL(req.url).searchParams.get("symbols"));
  if (!symbols) return fail(400, "Provide 1-120 valid symbols, comma separated.");
  try {
    return json({ quotes: await fetchQuotes(symbols), at: new Date().toISOString() });
  } catch (err) {
    return upstreamFailure("quotes", err);
  }
}
