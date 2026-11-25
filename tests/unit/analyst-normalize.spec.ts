import { expect, test } from "@playwright/test";
import { impliedUpside } from "@/lib/analyst-types";
import {
  buildDistribution,
  consensusFromTrend,
  finnhubProvenance,
  fmpTrendProvenance,
  normConsensusFmp,
  normHistory,
  normTargetsFmp,
  normTrendFinnhub,
  normTrendFmp,
} from "@/lib/server/analyst/normalize";
import { classifyFailure, issueMessage } from "@/lib/server/analyst/providers";
import { actionOf, consensusFromCounts, previousTargetFromTitle, ratingKeyOf } from "@/lib/server/analyst/ratings";
import {
  FETCHED_AT,
  FINNHUB_RECOMMENDATION,
  FMP_GRADES,
  FMP_GRADES_CONSENSUS,
  FMP_GRADES_HISTORICAL,
  FMP_PT_CONSENSUS,
  FMP_PT_NEWS,
  FMP_PT_SUMMARY,
} from "./analyst-fixtures";

test("price targets from price-target-consensus + summary", () => {
  const t = normTargetsFmp(FMP_PT_CONSENSUS, FMP_PT_SUMMARY, "AAPL", FETCHED_AT)!;
  expect(t).toMatchObject({ low: 250, average: 337.67, median: 340, high: 400, lastYearAverage: 304.86 });
  expect(t.counts).toEqual({ lastMonth: 8, lastQuarter: 20, lastYear: 67, allTime: 254 });
  expect(t.provenance).toMatchObject({ source: "fmp", asOf: FETCHED_AT });
  expect(normTargetsFmp(FMP_PT_CONSENSUS, null, "AAPL", FETCHED_AT)!.counts).toBeNull();
  expect(normTargetsFmp([], null, "AAPL", FETCHED_AT)).toBeNull();
  expect(normTargetsFmp([{ symbol: "X", targetHigh: 0, targetLow: null, targetConsensus: "n/a", targetMedian: -1 }], null, "X", FETCHED_AT)).toBeNull();
});

test("consensus from grades-consensus keeps FMP's label", () => {
  const c = normConsensusFmp(FMP_GRADES_CONSENSUS, "AAPL", FETCHED_AT)!;
  expect(c.rating).toBe("Buy");
  expect(c.ratingKey).toBe("buy");
  expect(c.total).toBe(111);
  expect(c.derived).toBe(false);
  expect(c.counts).toEqual({ strongBuy: 1, buy: 70, hold: 32, sell: 8, strongSell: 0 });
  expect(normConsensusFmp([], "AAPL", FETCHED_AT)).toBeNull();
  const noLabel = normConsensusFmp([{ symbol: "X", strongBuy: 0, buy: 0, hold: 4, sell: 0, strongSell: 0 }], "X", FETCHED_AT)!;
  expect(noLabel).toMatchObject({ rating: "Hold", derived: true });
});

test("monthly trend from grades-historical: oldest first, empty months dropped", () => {
  const trend = normTrendFmp(FMP_GRADES_HISTORICAL);
  expect(trend.map((m) => m.period)).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
  expect(trend[2]).toEqual({ period: "2026-07-01", counts: { strongBuy: 6, buy: 23, hold: 17, sell: 2, strongSell: 2 }, total: 50 });
});

test("finnhub recommendation trends as fallback distribution and derived consensus", () => {
  const trend = normTrendFinnhub(FINNHUB_RECOMMENDATION);
  expect(trend.map((m) => m.period)).toEqual(["2026-10-01", "2026-11-01"]);
  const prov = finnhubProvenance("AAPL", FETCHED_AT);
  const c = consensusFromTrend(trend, prov)!;
  expect(c).toMatchObject({ ratingKey: "buy", total: 44, derived: true });
  expect(c.provenance.source).toBe("finnhub");
  const d = buildDistribution(null, trend, prov)!;
  expect(d.current).toEqual({ strongBuy: 13, buy: 24, hold: 7, sell: 0, strongSell: 0 });
  expect(d.provenance.source).toBe("finnhub");
  expect(buildDistribution(null, [], null)).toBeNull();
});

test("distribution prefers consensus counts and keeps the FMP trend", () => {
  const c = normConsensusFmp(FMP_GRADES_CONSENSUS, "AAPL", FETCHED_AT);
  const d = buildDistribution(c, normTrendFmp(FMP_GRADES_HISTORICAL), fmpTrendProvenance("AAPL", FETCHED_AT))!;
  expect(d.currentTotal).toBe(111);
  expect(d.trend).toHaveLength(3);
  expect(d.trendProvenance?.source).toBe("fmp");
});

test("history joins grades with same-firm price-target notes", () => {
  const h = normHistory(FMP_GRADES, FMP_PT_NEWS, "AAPL", FETCHED_AT)!;
  // 5 valid grades + 1 unmatched note (Wedbush); the row without a date is dropped.
  expect(h.rows).toHaveLength(6);
  expect(h.rows.map((r) => r.date)).toEqual([...h.rows.map((r) => r.date)].sort().reverse());
  const ms = h.rows.find((r) => r.firm === "Morgan Stanley")!;
  expect(ms).toMatchObject({ action: "maintain", ratingNew: "Overweight", ratingKey: "buy", targetOld: 360, targetNew: 380, analyst: "Test Analyst A" });
  const dad = h.rows.find((r) => r.firm === "D.A. Davidson")!;
  expect(dad).toMatchObject({ action: "upgrade", ratingKey: "buy", targetNew: 370, targetOld: null });
  expect(h.rows.find((r) => r.firm === "Jefferies")).toMatchObject({ action: "downgrade", ratingKey: "sell", targetNew: null });
  expect(h.rows.find((r) => r.firm === "Loop Capital")).toMatchObject({ action: "initiate", ratingOld: null });
  expect(h.rows.find((r) => r.firm === "Wedbush")).toMatchObject({ action: "target", targetOld: 375, targetNew: 350, ratingNew: null });
  expect(normHistory(FMP_GRADES, null, "AAPL", FETCHED_AT)!.rows.every((r) => r.targetNew === null)).toBe(true);
  expect(normHistory([], [], "AAPL", FETCHED_AT)).toBeNull();
});

test("rating vocabulary maps onto five buckets", () => {
  expect(ratingKeyOf("Overweight")).toBe("buy");
  expect(ratingKeyOf("Sector Perform")).toBe("hold");
  expect(ratingKeyOf("Underperform")).toBe("sell");
  expect(ratingKeyOf("Market Outperform")).toBe("buy");
  expect(ratingKeyOf("Strong Buy")).toBe("strongBuy");
  expect(ratingKeyOf("Strong Sell")).toBe("strongSell");
  expect(ratingKeyOf("")).toBeNull();
  expect(actionOf("init", null, "Buy")).toBe("initiate");
  expect(actionOf("", "Hold", "Buy")).toBe("upgrade");
  expect(actionOf(null, "Buy", "Sell")).toBe("downgrade");
  expect(consensusFromCounts({ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 })).toBeNull();
  expect(previousTargetFromTitle("Apple price target lowered to $252 from $275 at Morgan Stanley")).toBe(275);
  expect(previousTargetFromTitle("Apple initiated with a Buy at Loop")).toBeNull();
});

test("provider errors map to honest messages", () => {
  expect(classifyFailure("fmp", 401, '{"Error Message":"Invalid API KEY."}')).toBe("auth");
  expect(classifyFailure("fmp", 402, "Restricted Endpoint")).toBe("plan");
  expect(classifyFailure("fmp", 403, "")).toBe("auth");
  expect(classifyFailure("fmp", 200, "This endpoint is not available under your current subscription")).toBe("plan");
  expect(classifyFailure("fmp", 429, "Limit Reach")).toBe("rate_limit");
  expect(classifyFailure("finnhub", 403, "You don't have access to this resource.")).toBe("plan");
  expect(classifyFailure("fmp", 500, "oops")).toBe("upstream");
  expect(issueMessage("fmp", "plan")).toBe("Your FMP plan does not include this dataset.");
  expect(issueMessage("fmp", "not_configured")).toContain("FMP_API_KEY");
});

test("implied upside", () => {
  expect(impliedUpside(110, 100)).toBeCloseTo(10);
  expect(impliedUpside(90, 100)).toBeCloseTo(-10);
  expect(impliedUpside(null, 100)).toBeNull();
  expect(impliedUpside(100, 0)).toBeNull();
});
