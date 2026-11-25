import { fail, json, upstreamFailure } from "@/lib/server/http";
import { earningsCalendar, economicCalendar } from "@/lib/server/nasdaq";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_AWAY = 21;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const date = params.get("date") ?? "";
  if (kind !== "economic" && kind !== "earnings") return fail(400, "kind must be economic or earnings.");
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!DATE_RE.test(date) || !Number.isFinite(t) || Math.abs(t - Date.now()) > MAX_DAYS_AWAY * 86_400_000) {
    return fail(400, "date must be YYYY-MM-DD within three weeks of today.");
  }
  try {
    const items = kind === "economic" ? await economicCalendar(date) : await earningsCalendar(date);
    return json({ kind, date, items }, 60);
  } catch (err) {
    return upstreamFailure("calendar", err);
  }
}
