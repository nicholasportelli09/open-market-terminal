/** Pure parts of the daily briefing: word counting, cache keys, session note. Unit-tested. */
import type { AnalystAnswer } from "@/lib/ai/types";
import { addDays, isTradingDay, nyParts, usEquitySession } from "@/lib/market-session";
import { fmtDateKey } from "@/lib/format";

export const BRIEFING_TARGET_WORDS = 100;
export const BRIEFING_MAX_WORDS = 130;
export const BRIEFING_TTL_MS = 3 * 60 * 60_000;
/** A forced refresh is refused while the cached briefing is younger than this. */
export const BRIEFING_MIN_REFRESH_MS = 20 * 60_000;

export const BRIEFING_SYMBOLS = [".SPX", ".IXIC", ".DJI", ".RUT", "US10Y", "US2Y", ".DXY", "@CL.1", "@GC.1", "BTC.CM="] as const;

/** Words in a text: runs of letters/digits (with inner . , ' % - kept), so "4.25%" and "S&P" count once each. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Words the reader sees: headings plus claim texts (reference markers are already removed by the parser). */
export function answerWordCount(answer: Pick<AnalystAnswer, "sections">): number {
  return answer.sections.reduce(
    (n, s) => n + countWords(s.heading ?? "") + s.claims.reduce((m, c) => m + countWords(c.text), 0),
    0,
  );
}

export function briefingCacheKey(marketDate: string, portfolioHash: string): string {
  return `briefing:${marketDate}:${portfolioHash}`;
}

/** Last NYSE trading day on or before `dateKey`. */
export function lastTradingDay(dateKey: string): string {
  let d = dateKey;
  for (let i = 0; i < 10 && !isTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

export type SessionInfo = { marketDate: string; sessionNote: string };

/**
 * Which market day the briefing covers and a plain note about it. Before the open (and on closed days)
 * it covers the last completed session; during and after the session it covers today.
 */
export function briefingSession(now: Date): SessionInfo {
  const p = nyParts(now);
  const s = usEquitySession(now);
  const today = p.dateKey;
  if (s.session === "regular") return { marketDate: today, sessionNote: "US markets are open; figures are intraday and will change." };
  if (s.session === "post") return { marketDate: today, sessionNote: "US regular session has closed; after-hours prices may still move." };
  if (s.reason === "overnight" && p.minutes >= 16 * 60 && isTradingDay(today)) {
    return { marketDate: today, sessionNote: "US markets are closed for the day; this covers today's session." };
  }
  const prior = lastTradingDay(addDays(today, -1));
  const why = s.reason === "weekend" ? "for the weekend" : s.reason === "holiday" ? `for ${s.holidayName ?? "a holiday"}` : "right now";
  const pre = s.session === "pre" ? " Pre-market trading has started." : "";
  return { marketDate: prior, sessionNote: `US markets are closed ${why}; this covers the last session, ${fmtDateKey(prior)}.${pre}` };
}
