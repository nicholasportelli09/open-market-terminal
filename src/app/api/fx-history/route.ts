import { badRequest, notFound, ok, upstream } from "@/lib/server/api";
import { fetchChart, fetchQuotes } from "@/lib/server/cnbc";
import { fxSymbol, usdPerUnit } from "@/lib/client/fx-quotes";
import { isIsoDate } from "@/lib/portfolio";
import type { Provenance } from "@/lib/provenance";
import type { Quote } from "@/lib/types";
import { addDaysIso, barsToCloses, chooseResolution, crossToBase, pickCommonClose, type Leg, type Resolution } from "./select";

export const dynamic = "force-dynamic";

const CURRENCY_RE = /^[A-Z]{3}$/;
const DAILY_TTL_MS = 3_600_000;
const WEEKLY_TTL_MS = 6 * 3_600_000;
const CACHE_SEC = 3600;
/**
 * The form caps the date at the viewer's local today, which in time zones ahead of UTC is one day
 * past the UTC date, so one extra day is accepted. Such a request still gets the last real close on
 * or before it, with that close's own date (never the requested one).
 */
const LOCAL_TZ_ALLOWANCE_DAYS = 1;
const SOURCE_FOR: Record<Resolution, { source: string; ttlMs: number }> = {
  daily: { source: "1Y", ttlMs: DAILY_TTL_MS },
  weekly: { source: "5Y", ttlMs: WEEKLY_TTL_MS },
};

export type FxHistoryLeg = { currency: string; symbol: string; pair: string; close: number; usdPerUnit: number };

export type FxHistoryData = {
  currency: string;
  base: string;
  requestedDate: string;
  /** Date the close was struck, on or before requestedDate. */
  date: string;
  resolution: Resolution;
  /** Units of base per 1 unit of currency. */
  rate: number;
  legs: FxHistoryLeg[];
  /** False when the close is today's still-moving bar. */
  final: boolean;
};

async function loadLeg(currency: string, resolution: Resolution): Promise<Leg> {
  const sym = fxSymbol(currency);
  if (!sym) return null;
  const { source, ttlMs } = SOURCE_FOR[resolution];
  return barsToCloses((await fetchChart(sym, source, ttlMs)).bars, resolution);
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/fx-history?currency=EUR&base=CHF&date=YYYY-MM-DD -> units of base per 1 EUR at the CNBC
 * close on that date (or the last close before it, with its real date), crossed through USD.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const currency = (params.get("currency") ?? "").toUpperCase();
  const base = (params.get("base") ?? "").toUpperCase();
  const date = params.get("date") ?? "";
  if (!CURRENCY_RE.test(currency) || !CURRENCY_RE.test(base)) return badRequest("currency and base must be 3-letter ISO codes such as EUR.");
  if (currency === base) return badRequest("currency and base are the same; the rate is 1.");
  if (!isIsoDate(date)) return badRequest("date must be a real YYYY-MM-DD date.");
  if (date > addDaysIso(utcToday(), LOCAL_TZ_ALLOWANCE_DAYS)) return badRequest("date cannot be in the future.");

  try {
    const symbols = [currency, base].map(fxSymbol).filter((s): s is string => !!s);
    const quotes = await fetchQuotes(symbols);
    const quoteOf = (c: string): Quote | undefined => quotes.find((q) => q.symbol === fxSymbol(c));
    for (const c of [currency, base]) {
      if (c !== "USD" && !quoteOf(c)) return notFound(`CNBC has no FX quote for ${c} (${fxSymbol(c)}).`);
    }

    const daily = await Promise.all([loadLeg(currency, "daily"), loadLeg(base, "daily")]);
    const resolution = chooseResolution(daily, date);
    const [ccyLeg, baseLeg] = resolution === "daily" ? daily : await Promise.all([loadLeg(currency, "weekly"), loadLeg(base, "weekly")]);
    const pick = pickCommonClose(ccyLeg, baseLeg, date, resolution);
    if (!pick) return notFound(`No CNBC FX close for ${currency}/${base} on or before ${date}.`);

    const legs: FxHistoryLeg[] = [];
    const usdPer = (c: string, close: number | null): number | null => {
      if (c === "USD") return 1;
      const q = quoteOf(c);
      if (!q || close === null) return null;
      const v = usdPerUnit(c, { ...q, last: close });
      if (v !== null) legs.push({ currency: c, symbol: q.symbol, pair: q.name, close, usdPerUnit: v });
      return v;
    };
    const usdPerCurrency = usdPer(currency, pick.currencyClose);
    const usdPerBase = usdPer(base, pick.baseClose);
    if (usdPerCurrency === null || usdPerBase === null) {
      return upstream("fx-history", new Error(`pair direction unclear for ${currency}/${base}`), "Could not tell the direction of the CNBC currency pair, so no rate is given.");
    }
    const rate = crossToBase(usdPerCurrency, usdPerBase);
    if (rate === null) return upstream("fx-history", new Error("non-positive close"), "CNBC returned an unusable close.");

    const final = pick.date < utcToday();
    const kind = resolution === "daily" ? "Daily close" : `Weekly close (week of ${pick.barDate})`;
    const sources: Provenance[] = legs.map((l) => ({
      source: "cnbc",
      asOf: pick.date,
      session: final ? "closed" : "continuous",
      url: `https://www.cnbc.com/quotes/${encodeURIComponent(l.symbol)}`,
      note: `${kind} of ${l.pair} (${l.symbol})${final ? "" : ", latest price, not yet a close"}`,
    }));
    const data: FxHistoryData = { currency, base, requestedDate: date, date: pick.date, resolution, rate, legs, final };
    return ok(data, sources, final ? CACHE_SEC : 0);
  } catch (err) {
    return upstream("fx-history", err, "CNBC currency history is unavailable right now. Try again shortly.");
  }
}
