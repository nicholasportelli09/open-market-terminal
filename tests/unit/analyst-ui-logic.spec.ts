import { expect, test } from "@playwright/test";
import { DEFAULT_FILTER, filterRows, monthsBefore, nextSort, sortRows } from "@/components/forecast/history-filter";
import { nearestIndex, niceTicks, spreadLabels } from "@/components/forecast/chart-geometry";
import { parseSavedModel, VALUATION_STORAGE_KEY } from "@/components/forecast/saved-model";
import { normHistory } from "@/lib/server/analyst/normalize";
import { FETCHED_AT, FMP_GRADES, FMP_PT_NEWS } from "./analyst-fixtures";

const rows = normHistory(FMP_GRADES, FMP_PT_NEWS, "AAPL", FETCHED_AT)!.rows;
const TODAY = "2026-07-30";

test("history filters: window, action, rating, firm search", () => {
  expect(monthsBefore("2026-07-30", 3)).toBe("2026-04-30");
  expect(filterRows(rows, DEFAULT_FILTER, TODAY).map((r) => r.firm)).not.toContain("Barclays");
  expect(filterRows(rows, { ...DEFAULT_FILTER, window: "all" }, TODAY)).toHaveLength(rows.length);
  expect(filterRows(rows, { ...DEFAULT_FILTER, window: "3m" }, TODAY).map((r) => r.firm)).toEqual(["Morgan Stanley", "D.A. Davidson", "Wedbush", "Jefferies"]);
  expect(filterRows(rows, { ...DEFAULT_FILTER, action: "downgrade", window: "all" }, TODAY).map((r) => r.firm)).toEqual(["Jefferies", "Barclays"]);
  expect(filterRows(rows, { ...DEFAULT_FILTER, rating: "buy" }, TODAY)).toHaveLength(3);
  expect(filterRows(rows, { ...DEFAULT_FILTER, firm: "  davidson " }, TODAY)).toHaveLength(1);
  expect(filterRows(rows, { ...DEFAULT_FILTER, firm: "analyst c" }, TODAY).map((r) => r.firm)).toEqual(["Wedbush"]);
});

test("history sort: by target, upside, firm; empty values last", () => {
  const byTarget = sortRows(rows, { key: "target", dir: "desc" }, 340);
  expect(byTarget.slice(0, 3).map((r) => r.targetNew)).toEqual([380, 370, 350]);
  expect(byTarget.at(-1)!.targetNew).toBeNull();
  const asc = sortRows(rows, { key: "target", dir: "asc" }, 340);
  expect(asc[0].targetNew).toBe(350);
  expect(asc.at(-1)!.targetNew).toBeNull();
  expect(sortRows(rows, { key: "firm", dir: "asc" }, null)[0].firm).toBe("Barclays");
  expect(sortRows(rows, { key: "upside", dir: "desc" }, null)[0].date).toBe(rows[0].date);
  expect(nextSort({ key: "date", dir: "desc" }, "date")).toEqual({ key: "date", dir: "asc" });
  expect(nextSort({ key: "date", dir: "desc" }, "firm")).toEqual({ key: "firm", dir: "asc" });
  expect(nextSort({ key: "date", dir: "desc" }, "target")).toEqual({ key: "target", dir: "desc" });
});

const good = {
  version: 1,
  models: {
    AAPL: {
      symbol: "AAPL",
      updatedAt: "2026-11-20T10:00:00.000Z",
      inputs: { mode: "fcfMargin" },
      scenarios: [],
      result: { perShare: 210.5, weighted: 205.1, scenarioValues: { bear: 150, base: 210.5, bull: 280 }, priceAtSave: 230, currency: "USD" },
    },
  },
};

test("saved valuation model: valid shape is read, bad data ignored", () => {
  expect(VALUATION_STORAGE_KEY).toBe("terminal.valuation.v1");
  expect(parseSavedModel(JSON.stringify(good), "aapl")).toEqual({
    symbol: "AAPL", updatedAt: "2026-11-20T10:00:00.000Z", perShare: 210.5, weighted: 205.1, bear: 150, base: 210.5, bull: 280, priceAtSave: 230, currency: "USD",
  });
  expect(parseSavedModel(JSON.stringify(good), "MSFT")).toBeNull();
  expect(parseSavedModel("{not json", "AAPL")).toBeNull();
  expect(parseSavedModel(null, "AAPL")).toBeNull();
  expect(parseSavedModel(JSON.stringify({ ...good, version: 2 }), "AAPL")).toBeNull();
  const badNum = structuredClone(good);
  (badNum.models.AAPL.result as Record<string, unknown>).perShare = "210";
  expect(parseSavedModel(JSON.stringify(badNum), "AAPL")).toBeNull();
  const badDate = structuredClone(good);
  badDate.models.AAPL.updatedAt = "yesterday";
  expect(parseSavedModel(JSON.stringify(badDate), "AAPL")).toBeNull();
  const nulls = structuredClone(good);
  nulls.models.AAPL.result = { perShare: null, weighted: null, scenarioValues: { bear: null, base: null, bull: null }, priceAtSave: null, currency: "USD" } as never;
  expect(parseSavedModel(JSON.stringify(nulls), "AAPL")).toBeNull();
});

test("target chart geometry: label spreading and ticks", () => {
  expect(spreadLabels([100, 105, 300], 30, 10, 290)).toEqual([100, 130, 290]);
  expect(spreadLabels([280, 285, 290], 30, 10, 290)).toEqual([230, 260, 290]);
  expect(spreadLabels([5], 30, 10, 290)).toEqual([10]);
  expect(niceTicks(247, 412, 4)).toEqual([250, 300, 350, 400]);
  expect(nearestIndex([{ t: 0, c: 1 }, { t: 10, c: 2 }, { t: 20, c: 3 }], 14)).toBe(1);
});
