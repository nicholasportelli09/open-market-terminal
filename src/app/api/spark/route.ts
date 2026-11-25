import { RANGE_SOURCE, presetBars, shapeChart, sparkline } from "@/lib/server/bars";
import { fetchChart } from "@/lib/server/cnbc";
import { fail, json, parseSymbols } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const MAX_SPARK = 40;
const SPARK_TTL_MS = 60_000;

export async function GET(req: Request) {
  const symbols = parseSymbols(new URL(req.url).searchParams.get("symbols"));
  if (!symbols || symbols.length > MAX_SPARK) return fail(400, `Provide 1-${MAX_SPARK} valid symbols.`);
  const settled = await Promise.allSettled(
    symbols.map(async (s) => {
      const raw = await fetchChart(s, RANGE_SOURCE["1D"].source, SPARK_TTL_MS);
      return [s, sparkline(presetBars(shapeChart(s, "1D", raw)))] as const;
    }),
  );
  const sparks: Record<string, number[]> = {};
  for (const r of settled) if (r.status === "fulfilled") sparks[r.value[0]] = r.value[1];
  return json({ sparks });
}
