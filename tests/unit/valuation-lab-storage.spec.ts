import { expect, test } from "@playwright/test";
import {
  deleteModel,
  getSavedModel,
  isSavedModel,
  parseStore,
  saveModel,
  VALUATION_STORAGE_KEY,
  type SavedModel,
} from "@/lib/client/valuation-models";

/** Test inputs for the storage schema; the numbers are arbitrary, not market data. */
const model = (over: Partial<SavedModel> = {}): SavedModel => ({
  symbol: "AAPL",
  updatedAt: "2026-11-22T08:00:00.000Z",
  inputs: {
    baseRevenue: 1000,
    years: 5,
    revenueGrowth: [0.1, 0.08],
    mode: "fcfMargin",
    fcfMargin: [0.2],
    wacc: 0.09,
    terminalGrowth: 0.025,
    netDebt: 100,
    sharesDiluted: 10,
    midYear: false,
  },
  scenarios: [
    { id: "bear", label: "Bear", overrides: { revenueGrowth: [0.02] }, weight: 0.25 },
    { id: "base", label: "Base", overrides: {}, weight: 0.5 },
    { id: "bull", label: "Bull", overrides: { wacc: 0.08 }, weight: 0.25 },
  ],
  result: { perShare: 42, weighted: null, scenarioValues: { bear: 30, base: 42, bull: null }, priceAtSave: 40, currency: "USD" },
  ...over,
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const g = globalThis as unknown as { window?: unknown };
test.afterEach(() => {
  delete g.window;
});

test("parseStore: empty, corrupt JSON, wrong version and wrong shape give an empty store", () => {
  const empty = { version: 1, models: {} };
  expect(parseStore(null)).toEqual(empty);
  expect(parseStore("{not json")).toEqual(empty);
  expect(parseStore(JSON.stringify({ version: 2, models: { AAPL: model() } }))).toEqual(empty);
  expect(parseStore(JSON.stringify({ version: 1, models: [] }))).toEqual(empty);
  expect(parseStore("null")).toEqual(empty);
});

test("parseStore keeps valid entries and drops bad ones", () => {
  const raw = JSON.stringify({
    version: 1,
    models: {
      AAPL: model(),
      MSFT: model({ symbol: "MSFT", inputs: { ...model().inputs, wacc: Number.NaN } }), // NaN -> null in JSON
      GOOGL: model({ symbol: "AAPL" }), // key does not match the symbol
      TSLA: { ...model({ symbol: "TSLA" }), scenarios: [{ id: "worst", label: "x", overrides: {}, weight: 0.5 }] },
      NVDA: { ...model({ symbol: "NVDA" }), result: { perShare: "12" } },
    },
  });
  const store = parseStore(raw);
  expect(Object.keys(store.models)).toEqual(["AAPL"]);
});

test("isSavedModel checks the mode-specific inputs and weights", () => {
  expect(isSavedModel(model())).toBe(true);
  const fundamental = { ...model().inputs, mode: "fundamental" as const, fcfMargin: undefined };
  expect(isSavedModel(model({ inputs: fundamental }))).toBe(false); // no ebitMargin / taxRate / salesToCapital
  expect(isSavedModel(model({ inputs: { ...fundamental, ebitMargin: [0.3], taxRate: 0.2, salesToCapital: 2 } }))).toBe(true);
  expect(isSavedModel(model({ inputs: { ...model().inputs, revenueGrowth: [] } }))).toBe(false);
  expect(isSavedModel(model({ scenarios: [{ id: "bear", label: "Bear", overrides: {}, weight: 1.5 }] }))).toBe(false);
  expect(isSavedModel(model({ updatedAt: "yesterday" }))).toBe(false);
  expect(isSavedModel(model({ scenarios: [{ id: "bear", label: "Bear", overrides: { unknownKey: 1 } as never, weight: 0 }] }))).toBe(false);
});

test("save, read back (case-insensitive) and delete through localStorage", () => {
  const storage = new MemoryStorage();
  g.window = { localStorage: storage };
  expect(getSavedModel("AAPL")).toBeNull();
  expect(saveModel(model({ symbol: "aapl" }))).toBe(true);
  const raw = JSON.parse(storage.getItem(VALUATION_STORAGE_KEY) ?? "{}");
  expect(raw.version).toBe(1);
  expect(Object.keys(raw.models)).toEqual(["AAPL"]);
  expect(getSavedModel(" aapl ")?.result.perShare).toBe(42);
  expect(deleteModel("AAPL")).toBe(true);
  expect(getSavedModel("AAPL")).toBeNull();
});

test("an invalid model is refused and storage that throws never breaks reads", () => {
  g.window = { localStorage: new MemoryStorage() };
  expect(saveModel(model({ inputs: { ...model().inputs, sharesDiluted: Number.POSITIVE_INFINITY } }))).toBe(false);

  g.window = {
    get localStorage(): Storage {
      throw new Error("SecurityError: storage disabled");
    },
  };
  expect(getSavedModel("AAPL")).toBeNull();
  expect(saveModel(model())).toBe(false);

  const full = new MemoryStorage();
  full.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  g.window = { localStorage: full };
  expect(saveModel(model())).toBe(false);

  const corrupt = new MemoryStorage();
  corrupt.setItem(VALUATION_STORAGE_KEY, "{\"version\":1,\"models\":{\"AAPL\":");
  g.window = { localStorage: corrupt };
  expect(getSavedModel("AAPL")).toBeNull();
});
