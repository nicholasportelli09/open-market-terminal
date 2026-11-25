import { expect, test } from "@playwright/test";
import { curveSnapshots } from "@/lib/macro/curve";
import { decimalsOf, liveSeries, precisePairSeries, usdValueChange } from "@/lib/macro/live";
import { addMonths, changeOver, lastMove, monthlyDiff, onOrBefore, yoySeries, type Point } from "@/lib/macro/math";
import { buildReading } from "@/lib/macro/readings";
import { fmtLevel, fmtPeriodChange } from "@/lib/macro/units";

const monthly = (start: string, values: (number | null)[]): Point[] =>
  values.flatMap((v, i) => (v === null ? [] : [{ date: addMonths(start, i), value: v }]));

test("addMonths clamps the day and crosses years", () => {
  expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
  expect(addMonths("2026-01-15", -12)).toBe("2025-01-15");
  expect(addMonths("2025-12-01", 1)).toBe("2026-01-01");
  expect(() => addMonths("2026-1-1", 1)).toThrow();
});

test("YoY is the 12-month change of the index level, month by month", () => {
  // 13 monthly index levels: 100 then +0.25 a month.
  const idx = monthly("2025-01-01", Array.from({ length: 13 }, (_, i) => 100 + i * 0.25));
  const yoy = yoySeries(idx);
  expect(yoy).toHaveLength(1);
  expect(yoy[0].date).toBe("2026-01-01");
  expect(yoy[0].value).toBeCloseTo(3, 10);
});

test("YoY skips a month whose year-earlier observation is missing (no filling)", () => {
  // Oct 2025 missing, like FRED's CPI after the 2025 shutdown.
  const values: (number | null)[] = Array.from({ length: 25 }, (_, i) => 300 + i);
  values[9] = null; // 2025-10
  const idx = monthly("2025-01-01", values);
  const yoy = yoySeries(idx);
  const dates = yoy.map((p) => p.date);
  expect(dates).not.toContain("2026-10-01");
  expect(dates).toContain("2026-09-01");
  expect(dates).toContain("2026-11-01");
  const sep = yoy.find((p) => p.date === "2026-09-01")!;
  expect(sep.value).toBeCloseTo((320 / 308 - 1) * 100, 10);
});

test("CPI reading reports the reference month and explains a skipped latest month", () => {
  const values: (number | null)[] = Array.from({ length: 34 }, (_, i) => 300 + i);
  values[21] = null; // 2025-10 missing -> 2026-10 YoY impossible
  const r = buildReading("CPIAUCSL", monthly("2024-01-01", values))!;
  expect(r.latest.date).toBe("2026-09-01");
  expect(r.note).toContain("Oct 2026");
  expect(r.y1).not.toBeNull();
  expect(r.m1?.from.date).toBe("2026-08-01");
});

test("changeOver handles weekends, holidays and irregular gaps", () => {
  const pts: Point[] = [
    { date: "2025-11-17", value: 4.4 },
    { date: "2025-11-20", value: 4.5 },
    { date: "2026-10-16", value: 4.9 }, // Friday
    { date: "2026-10-20", value: 4.95 },
    { date: "2026-11-19", value: 5.04 },
  ];
  const latest = pts.at(-1)!;
  // 1m target 2026-10-19 (Monday, no print): uses Friday 2026-10-16.
  const m1 = changeOver(pts, latest, 1, 7)!;
  expect(m1.from.date).toBe("2026-10-16");
  expect(m1.diff).toBeCloseTo(0.14, 10);
  // 1y target 2025-11-19: last on or before is 2025-11-17.
  const y1 = changeOver(pts, latest, 12, 7)!;
  expect(y1.from.date).toBe("2025-11-17");
  expect(y1.pct).toBeCloseTo((5.04 / 4.4 - 1) * 100, 10);
  // A hole longer than the tolerance gives no answer rather than an old value.
  expect(changeOver(pts, latest, 6, 7)).toBeNull();
  expect(onOrBefore(pts, "2026-05-19", 30)).toBeNull();
});

test("changeOver: percent change is null across a sign change or from zero", () => {
  const pts: Point[] = [
    { date: "2025-11-19", value: -0.2 },
    { date: "2026-11-19", value: 0.3 },
  ];
  const c = changeOver(pts, pts[1], 12, 7)!;
  expect(c.diff).toBeCloseTo(0.5, 10);
  expect(c.pct).toBeNull();
});

test("monthly payroll change requires consecutive months; lastMove finds the last policy move", () => {
  const lv = monthly("2026-01-01", [100, 103, 104]);
  expect(monthlyDiff(lv).map((p) => p.value)).toEqual([3, 1]);
  expect(monthlyDiff([lv[0], lv[2]])).toEqual([]);
  const fed: Point[] = [
    { date: "2026-09-16", value: 4.25 },
    { date: "2026-09-17", value: 4.0 },
    { date: "2026-10-30", value: 4.0 },
  ];
  expect(lastMove(fed)).toEqual({ date: "2026-09-17", diff: -0.25 });
  expect(lastMove([fed[1], fed[2]])).toBeNull();
});

test("units: bp for rates and spreads, % for prices, pp for YoY, points for VIX", () => {
  const c = { from: { date: "2026-10-19", value: 4.9 }, diff: 0.14, pct: 2.857 };
  expect(fmtPeriodChange("rate", c)).toBe("+14 bp");
  expect(fmtPeriodChange("spread", { ...c, diff: -0.05 })).toBe("−5 bp");
  expect(fmtPeriodChange("level", c)).toBe("+2.86%");
  expect(fmtPeriodChange("yoy", { ...c, diff: -0.2 })).toBe("−0.2 pp");
  expect(fmtPeriodChange("index", { ...c, diff: 3.5 })).toBe("+3.50 pts");
  expect(fmtPeriodChange("rate", null)).toBe("—");
  expect(fmtLevel("spread", 3.52, undefined, false)).toBe("352 bp");
  expect(fmtLevel("spread", -0.12, undefined, true)).toBe("−12 bp");
});

test("curve snapshots use each tenor's last print on or before the date, never filled", () => {
  const s = (pts: [string, number][]) => pts.map(([date, value]) => ({ date, value }));
  const series = {
    DGS3MO: s([["2025-11-19", 4.3], ["2026-10-19", 4.2], ["2026-11-19", 4.34]]),
    DGS2: s([["2025-11-19", 4.0], ["2026-10-16", 4.6], ["2026-11-19", 4.76]]),
    DGS10: s([["2025-11-19", 4.4], ["2026-10-19", 4.9], ["2026-11-19", 5.04]]),
    DGS30: s([["2026-10-19", 5.3], ["2026-11-18", 5.4]]),
  };
  const snaps = curveSnapshots(series);
  expect(snaps.map((x) => x.key)).toEqual(["now", "m1"]); // 1y has only 3 tenors (< 4)
  expect(snaps[0].date).toBe("2026-11-19");
  expect(snaps[0].points.find((p) => p.id === "DGS30")?.date).toBe("2026-11-18");
  expect(snaps[1].points.find((p) => p.id === "DGS2")?.date).toBe("2026-10-16");
});

test("live series swaps today's bar for the live price; USD value change respects pair direction", () => {
  const history: Point[] = [
    { date: "2025-11-20", value: 150 },
    { date: "2026-10-21", value: 154 },
    { date: "2026-11-20", value: 155.2 },
    { date: "2026-11-21", value: 155.9 },
  ];
  const s = liveSeries(history, 156, "2026-11-21");
  expect(s.points.at(-1)).toEqual({ date: "2026-11-21", value: 156 });
  expect(s.points).toHaveLength(4);
  expect(s.y1?.from.date).toBe("2025-11-20");
  // USD/JPY 150 -> 156: yen lost value against the dollar.
  expect(usdValueChange(s.y1, 156, false)).toBeCloseTo((150 / 156 - 1) * 100, 10);
  // EUR/USD style (direct) 1.05 -> 1.10.
  const eur = liveSeries([{ date: "2025-11-21", value: 1.05 }], 1.1, "2026-11-21");
  expect(usdValueChange(eur.y1, 1.1, true)).toBeCloseTo((1.1 / 1.05 - 1) * 100, 10);
  expect(usdValueChange(null, 1.1, true)).toBeNull();
});

test("decimalsOf counts written decimals", () => {
  expect(decimalsOf(0.84)).toBe(2);
  expect(decimalsOf(0.8431)).toBe(4);
  expect(decimalsOf(156)).toBe(0);
  expect(decimalsOf(1.1)).toBe(1);
});

test("precisePairSeries ends at the last close when the live quote is rounded coarser", () => {
  const history: Point[] = [
    { date: "2025-11-20", value: 0.8056 },
    { date: "2026-11-19", value: 0.8431 },
    { date: "2026-11-20", value: 0.8438 },
    { date: "2026-11-21", value: 0.84 },
  ];
  const coarse = precisePairSeries(history, 0.84, 2, "2026-11-21");
  expect(coarse.latest).toEqual({ date: "2026-11-20", value: 0.8438 });
  expect(coarse.y1?.from.date).toBe("2025-11-20");
  expect(usdValueChange(coarse.y1, coarse.latest.value, false)).toBeCloseTo((0.8056 / 0.8438 - 1) * 100, 10);
  // Same precision as the closes: the live value is kept.
  const fine = precisePairSeries(history, 0.8442, 4, "2026-11-21");
  expect(fine.latest).toEqual({ date: "2026-11-21", value: 0.8442 });
  // No earlier close to fall back to: live value.
  expect(precisePairSeries([], 0.84, 2, "2026-11-21").latest).toEqual({ date: "2026-11-21", value: 0.84 });
});
