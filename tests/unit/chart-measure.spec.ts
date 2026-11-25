import { expect, test } from "@playwright/test";
import { formatSpan, indexOfTime, measureBetween } from "@/components/chart/chart-measure";
import type { Bar } from "@/lib/types";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
const bar = (iso: string, c: number): Bar => ({ t: day(iso), o: c, h: c, l: c, c, v: 0 });
const BARS = [bar("2026-07-29", 7000), bar("2026-07-30", 7100), bar("2026-08-13", 7462.1), bar("2026-08-14", 6900)];

test("measures from the earlier bar to the later one, whichever way the drag went", () => {
  const right = measureBetween(BARS, 0, 2);
  const left = measureBetween(BARS, 2, 0);
  expect(left).toEqual(right);
  expect(right?.change).toBeCloseTo(462.1, 6);
  expect(right?.pct).toBeCloseTo(6.6014, 3);
  expect(right?.up).toBe(true);
  const down = measureBetween(BARS, 2, 3);
  expect(down?.up).toBe(false);
  expect(down?.pct).toBeCloseTo(((6900 - 7462.1) / 7462.1) * 100, 6);
});

test("positions round to bars and clamp to the data; one bar or no data measures nothing", () => {
  expect(measureBetween(BARS, -5, 1.4)?.lo).toBe(0);
  expect(measureBetween(BARS, -5, 1.4)?.hi).toBe(1);
  expect(measureBetween(BARS, 0, 99)?.hi).toBe(3);
  expect(measureBetween(BARS, 1, 1.2)).toBeNull();
  expect(measureBetween([], 0, 3)).toBeNull();
  expect(measureBetween(BARS, Number.NaN, 2)).toBeNull();
});

test("no percent from a zero or negative start (e.g. a negative yield)", () => {
  const m = measureBetween([bar("2026-01-02", -0.1), bar("2026-01-05", 0.2)], 0, 1);
  expect(m?.change).toBeCloseTo(0.3, 9);
  expect(m?.pct).toBeNull();
});

test("span labels drop the repeated year and keep intraday times", () => {
  expect(formatSpan(day("2026-07-29"), day("2026-08-13"), "YTD", "1D")).toBe("Jul 29 – Aug 13, 2026");
  expect(formatSpan(day("2025-12-30"), day("2026-01-05"), "1Y", "1D")).toBe("Dec 30, 2025 – Jan 5, 2026");
  const t = Date.parse("2026-11-24T10:30:00Z") / 1000;
  expect(formatSpan(t, t + 3 * 3600, "1D")).toBe("10:30 AM – 1:30 PM");
  // Scrolled back into the previous session on 1D: the dates are shown.
  expect(formatSpan(t - 86_400, t, "1D")).toBe("Nov 23, 10:30 AM – Nov 24, 10:30 AM");
});

test("a measured point keeps its bar by time when the data refreshes", () => {
  const t = BARS.map((b) => b.t);
  expect(indexOfTime(BARS, t[2])).toBe(2);
  // The first bar dropped off: the same time is now at index 1.
  expect(indexOfTime(BARS.slice(1), t[2])).toBe(1);
  // A time that is gone maps to the nearest bar.
  expect(indexOfTime(BARS, t[1] + 3600)).toBe(1);
  expect(indexOfTime(BARS, t[3] + 86_400 * 30)).toBe(3);
  expect(indexOfTime(BARS, 0)).toBe(0);
});
