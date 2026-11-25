import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { parseSubmissions, parseTickerMap, secTicker } from "@/lib/server/sec";
import {
  annualSeries, buildFlow, coverShares, discreteQuarters, filingUrl, ttmAt, ttmYearBefore, type RawFact,
} from "@/lib/server/sec-facts";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "../fixtures/sec", name), "utf8"));

/** Calendar-year company: FY facts in 10-K, 3-month and YTD facts in 10-Q. */
function f(start: string | undefined, end: string, val: number, form: string, filed: string, accn = `acc-${filed}`, fy = 2025): RawFact {
  return { start, end, val, form, filed, accn, fy, fp: form === "10-K" ? "FY" : "Q" };
}

const CASH_FLOW_ONLY_YTD: RawFact[] = [
  f("2024-01-01", "2024-12-31", 400, "10-K", "2025-02-01", "k24", 2024),
  f("2024-01-01", "2024-09-30", 290, "10-Q", "2024-11-01", "q324", 2024),
  f("2025-01-01", "2025-03-31", 110, "10-Q", "2025-05-01", "q125"),
  f("2025-01-01", "2025-06-30", 230, "10-Q", "2025-08-01", "q225"),
  f("2025-01-01", "2025-09-30", 360, "10-Q", "2025-11-01", "q325"),
];

test("derives Q2/Q3 from year-to-date figures and Q4 from FY minus 9 months", () => {
  const qs = discreteQuarters(CASH_FLOW_ONLY_YTD, "X");
  const byEnd = Object.fromEntries(qs.map((q) => [q.end, q]));
  expect(byEnd["2024-12-31"]).toMatchObject({ start: "2024-10-01", value: 110, derived: true, accn: "k24" });
  expect(byEnd["2025-03-31"]).toMatchObject({ value: 110 });
  expect(byEnd["2025-06-30"]).toMatchObject({ start: "2025-04-01", value: 120, derived: true });
  expect(byEnd["2025-09-30"]).toMatchObject({ start: "2025-07-01", value: 130, derived: true });

  const ttm = ttmAt(buildFlow(CASH_FLOW_ONLY_YTD, "X"));
  expect(ttm).toMatchObject({ basis: "quarters", end: "2025-09-30", start: "2024-10-01", value: 110 + 110 + 120 + 130 });
});

test("TTM is unavailable when a quarter cannot be built from filed pieces", () => {
  // No 9-month 2024 figure: Q4 2024 cannot be derived, so there is no TTM to 2025-09-30.
  const gappy = CASH_FLOW_ONLY_YTD.filter((p) => p.accn !== "q324");
  expect(ttmAt(buildFlow(gappy, "X"))).toBeNull();
});

test("Q4 is derived from FY minus Q1+Q2+Q3 when only discrete quarters were filed", () => {
  const facts = [
    f("2025-01-01", "2025-12-31", 100, "10-K", "2026-02-01", "k25"),
    f("2025-01-01", "2025-03-31", 20, "10-Q", "2025-05-01"),
    f("2025-04-01", "2025-06-30", 25, "10-Q", "2025-08-01"),
    f("2025-07-01", "2025-09-30", 30, "10-Q", "2025-11-01"),
  ];
  const q4 = discreteQuarters(facts, "X").find((q) => q.end === "2025-12-31");
  expect(q4).toMatchObject({ start: "2025-10-01", value: 25, derived: true });
});

test("a fiscal year ending at the TTM date is used directly, and restatements win", () => {
  const facts = [
    f("2024-01-01", "2024-12-31", 90, "10-K", "2025-02-01", "k24", 2024),
    f("2025-01-01", "2025-12-31", 100, "10-K", "2026-02-01", "k25"),
    // Next year's 10-K restates FY2024 as a comparative; its fy (2026) must not relabel the period.
    f("2024-01-01", "2024-12-31", 95, "10-K", "2027-02-01", "k26", 2026),
    f("2026-01-01", "2026-12-31", 120, "10-K", "2027-02-01", "k26", 2026),
  ];
  const annual = annualSeries(facts, "X");
  expect(annual.map((a) => [a.fiscalYear, a.value, a.accn])).toEqual([[2024, 95, "k26"], [2025, 100, "k25"], [2026, 120, "k26"]]);
  const flow = buildFlow(facts, "X");
  const ttm = ttmAt(flow);
  expect(ttm).toMatchObject({ basis: "annual", value: 120 });
  expect(ttmYearBefore(flow, ttm!)).toMatchObject({ basis: "annual", value: 100 });
});

test("cover-page shares sum share classes from the same filing", () => {
  const shares = coverShares([
    { end: "2026-01-20", val: 5_800_000_000, accn: "a1", form: "10-K", filed: "2026-02-01" },
    { end: "2026-01-20", val: 860_000_000, accn: "a1", form: "10-K", filed: "2026-02-01" },
    { end: "2025-10-20", val: 9_999, accn: "a0", form: "10-Q", filed: "2025-11-01" },
  ]);
  expect(shares).toMatchObject({ value: 6_660_000_000, end: "2026-01-20", classes: 2 });
});

test("ticker mapping handles class shares and pads CIKs", () => {
  const map = parseTickerMap(fixture("company_tickers.json"));
  expect(secTicker("brk.b")).toBe("BRK-B");
  expect(map.get(secTicker("BRK.B"))).toMatchObject({ cik: "0001067983" });
  expect(map.get("AAPL")).toMatchObject({ cik: "0000320193", title: "Apple Inc." });
  expect(map.get("NOPE")).toBeUndefined();
});

test("submissions profile and filing URLs", () => {
  const p = parseSubmissions(fixture("aapl-submissions.json"), "320193");
  expect(p).toMatchObject({ cik: "0000320193", sic: "3571", sicDescription: "Electronic Computers", exchanges: ["Nasdaq"] });
  expect(filingUrl("0000320193", "0000320193-26-000026")).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/");
});
