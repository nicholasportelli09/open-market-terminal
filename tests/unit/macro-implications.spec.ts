import { expect, test } from "@playwright/test";
import {
  conditionsRule,
  creditRule,
  curveRule,
  dollarRule,
  implications,
  inflationRule,
  realYieldRule,
  vixRule,
  type MacroInputs,
} from "@/lib/macro/implications";
import { buildInputs } from "@/lib/macro/inputs";
import { buildReading } from "@/lib/macro/readings";

const at = (value: number) => ({ value, asOf: "2026-11-19" });

test("curve: inverted below 0, re-steepening after a recent inversion, normal otherwise", () => {
  expect(curveRule({ t10y3m: at(-0.01) })?.threshold).toContain("Inverted");
  expect(curveRule({ t10y3m: at(-0.01) })?.tone).toBe("headwind");
  expect(curveRule({ t10y3m: at(0), curveInvertedWithin1y: true })?.threshold).toContain("after an inversion");
  const normal = curveRule({ t10y3m: at(0), curveInvertedWithin1y: false });
  expect(normal?.tone).toBe("neutral");
  expect(normal?.threshold).toContain("Normal");
  // Falls back to 10y-2y and says so.
  expect(curveRule({ t10y2y: at(0.29) })?.reading).toBe("10y−2y at +29 bp");
  expect(curveRule({})).toBeNull();
});

test("credit: stress at 600 bp and above, tight at 350 bp and below", () => {
  expect(creditRule({ hyOas: at(6.0) })?.threshold).toContain("Stress");
  expect(creditRule({ hyOas: at(5.99) })?.threshold).toContain("Normal");
  expect(creditRule({ hyOas: at(3.5) })?.threshold).toContain("Tight");
  expect(creditRule({ hyOas: at(3.51) })?.threshold).toContain("Normal");
  expect(creditRule({ hyOas: at(3.52) })?.reading).toBe("High yield spread 352 bp");
});

test("real yields: high above 2%, negative at or below 0", () => {
  expect(realYieldRule({ real10y: at(2.0) })?.threshold).toContain("Moderate");
  expect(realYieldRule({ real10y: at(2.01) })?.tone).toBe("headwind");
  expect(realYieldRule({ real10y: at(0) })?.tone).toBe("supportive");
  expect(realYieldRule({ real10y: at(0.01) })?.tone).toBe("neutral");
});

test("VIX regimes at 15, 20 and 30", () => {
  const v = (value: number) => vixRule({ vix: { ...at(value), source: "FRED daily close" } })?.threshold;
  expect(v(14.99)).toContain("Calm");
  expect(v(15)).toContain("Normal");
  expect(v(19.99)).toContain("Normal");
  expect(v(20)).toContain("Elevated");
  expect(v(29.99)).toContain("Elevated");
  expect(v(30)).toContain("Stress");
  expect(vixRule({ vix: { ...at(28.44), source: "CNBC live" } })?.reading).toBe("VIX 28.44 (CNBC live)");
});

test("inflation vs the 2% goal: bands at 1.5, 2.5 and 3.0", () => {
  const t = (value: number) => inflationRule({ corePce: at(value) })?.threshold;
  expect(t(1.49)).toBe("Below 1.5%");
  expect(t(1.5)).toContain("Near");
  expect(t(2.5)).toContain("Near");
  expect(t(2.51)).toContain("over 2.5%");
  expect(t(2.99)).toContain("over 2.5%");
  expect(t(3.0)).toContain("Well above");
});

test("dollar trend: +-5% over a year", () => {
  expect(dollarRule({ dollar1y: at(5) })?.threshold).toContain("Strong rise");
  expect(dollarRule({ dollar1y: at(4.99) })?.threshold).toContain("Little changed");
  expect(dollarRule({ dollar1y: at(-5) })?.threshold).toContain("Clear fall");
  expect(dollarRule({ dollar1y: at(-4.99) })?.tone).toBe("neutral");
  expect(dollarRule({ dollar1y: at(-2.34) })?.reading).toBe("Broad dollar −2.3% over 1 year");
});

test("financial conditions: tighter than average above 0", () => {
  expect(conditionsRule({ nfci: at(0) })?.tone).toBe("supportive");
  expect(conditionsRule({ nfci: at(0.001) })?.tone).toBe("headwind");
  expect(conditionsRule({ nfci: at(-0.478) })?.reading).toBe("NFCI −0.478");
});

test("missing inputs produce no note; every note shows a threshold and as-of; no forecasts", () => {
  expect(implications({})).toEqual([]);
  const all: MacroInputs = {
    t10y3m: at(0.6),
    hyOas: at(3.52),
    real10y: at(2.88),
    vix: { ...at(28.44), source: "CNBC live" },
    corePce: at(2.9),
    dollar1y: at(-1.2),
    nfci: at(-0.478),
  };
  const notes = implications(all);
  expect(notes.map((n) => n.id)).toEqual(["curve", "credit", "real-yield", "vix", "inflation", "dollar", "conditions"]);
  for (const n of notes) {
    expect(n.threshold.length).toBeGreaterThan(0);
    expect(n.asOf).toBe("2026-11-19");
    expect(n.note).not.toMatch(/\b(will|buy|sell)\b/i);
  }
});

test("buildInputs prefers live VIX, uses 10y-3m first and the broad dollar's 1-year % change", () => {
  const daily = (vals: [string, number][]) => vals.map(([date, value]) => ({ date, value }));
  const readings: Record<string, ReturnType<typeof buildReading>> = {
    T10Y3M: buildReading("T10Y3M", daily([["2026-02-02", -0.1], ["2026-11-20", 0.6]])),
    VIXCLS: buildReading("VIXCLS", daily([["2026-11-19", 28.44]])),
    DTWEXBGS: buildReading("DTWEXBGS", daily([["2025-11-13", 125], ["2026-11-13", 122.65]])),
  };
  const get = (id: string) => readings[id] ?? null;
  const withLive = buildInputs(get, { value: 27.1, asOf: "2026-11-20T21:15:00.000Z" });
  expect(withLive.vix).toEqual({ value: 27.1, asOf: "2026-11-20T21:15:00.000Z", source: "CNBC live" });
  expect(withLive.curveInvertedWithin1y).toBe(true);
  expect(withLive.dollar1y?.value).toBeCloseTo((122.65 / 125 - 1) * 100, 10);
  expect(buildInputs(get, null).vix?.source).toBe("FRED daily close");
  expect(buildInputs(() => null, null)).toEqual({
    t10y3m: undefined,
    t10y2y: undefined,
    curveInvertedWithin1y: undefined,
    hyOas: undefined,
    real10y: undefined,
    vix: undefined,
    corePce: undefined,
    dollar1y: undefined,
    nfci: undefined,
  });
});
