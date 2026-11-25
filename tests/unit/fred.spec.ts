import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { fredProvenance, fredSeries, isFredId, parseFredCsv } from "@/lib/server/fred";

/** Real fredgraph.csv response for DGS10 from 2026-10-20 (captured 2026-11-21); 2026-11-11 is blank. */
const csv = readFileSync(join(__dirname, "../fixtures/fred-dgs10.csv"), "utf8");

test("parses FRED CSV and drops missing observations", () => {
  const points = parseFredCsv(csv, "DGS10");
  expect(points).not.toBeNull();
  expect(points![0]).toEqual({ date: "2026-10-20", value: 5.12 });
  expect(points!.find((p) => p.date === "2026-11-11")).toBeUndefined();
  expect(points!.every((p) => Number.isFinite(p.value))).toBe(true);
  expect(parseFredCsv("observation_date,X\n2026-01-01,.\n2026-01-02,1.5\n", "X")).toEqual([{ date: "2026-01-02", value: 1.5 }]);
});

test("rejects a body that is not the requested series", () => {
  expect(parseFredCsv(csv, "CPIAUCSL")).toBeNull();
  expect(parseFredCsv("<!DOCTYPE html><html>", "DGS10")).toBeNull();
});

test("validates series ids before any request", async () => {
  expect(isFredId("DGS10")).toBe(true);
  expect(isFredId("T10Y2Y")).toBe(true);
  expect(isFredId("dgs10")).toBe(false);
  expect(isFredId("A")).toBe(false);
  expect(isFredId("DGS10&x=1")).toBe(false);
  await expect(fredSeries("bad id!")).rejects.toMatchObject({ code: "bad_request" });
  await expect(fredSeries("DGS10", { start: "2026/01/01" })).rejects.toMatchObject({ code: "bad_request" });
});

test("provenance points at the series page", () => {
  const points = parseFredCsv(csv, "DGS10")!;
  const p = fredProvenance({ id: "DGS10", last: points.at(-1)!, url: "https://fred.stlouisfed.org/series/DGS10" });
  expect(p).toMatchObject({ source: "fred", asOf: points.at(-1)!.date, session: "n/a", url: "https://fred.stlouisfed.org/series/DGS10" });
});
