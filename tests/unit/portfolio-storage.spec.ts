import { expect, test } from "@playwright/test";
import {
  CORRUPT_KEY_PREFIX,
  LocalPortfolioRepository,
  STORAGE_KEY,
  addTransaction,
  createPortfolio,
  createTransaction,
  type StorageLike,
} from "@/lib/portfolio";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const NOW = () => new Date("2025-06-30T12:00:00.000Z");

function samplePortfolio() {
  const p = createPortfolio("Main", "USD", NOW());
  const t = createTransaction({ date: "2025-01-02", type: "buy", symbol: "AAPL", quantity: 2, price: 150, currency: "USD" }, NOW());
  return addTransaction(p, t, NOW());
}

test("save, load, export and import round-trip", () => {
  const storage = memoryStorage();
  const repo = new LocalPortfolioRepository(storage, NOW);
  expect(repo.loadStatus()).toEqual({ status: "empty" });
  const p = samplePortfolio();
  expect(repo.save(p)).toEqual({ ok: true });
  expect(storage.data.has(STORAGE_KEY)).toBe(true);
  expect(repo.load()).toEqual(p);
  const imported = repo.importJson(repo.exportJson(p));
  expect(imported).toEqual({ ok: true, portfolio: p });
});

test("corrupt stored JSON is backed up, cleared and reported without throwing", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
  const repo = new LocalPortfolioRepository(storage, NOW);
  const status = repo.loadStatus();
  expect(status.status).toBe("corrupt");
  if (status.status !== "corrupt") return;
  expect(status.backupKey?.startsWith(CORRUPT_KEY_PREFIX)).toBe(true);
  expect(storage.data.get(status.backupKey as string)).toBe("{not json");
  expect(storage.data.has(STORAGE_KEY)).toBe(false);
  expect(repo.load()).toBeNull();
});

test("import rejects corrupt or invalid JSON with readable errors", () => {
  const repo = new LocalPortfolioRepository(memoryStorage(), NOW);
  const notJson = repo.importJson("{\"version\":1,");
  expect(notJson.ok).toBe(false);
  expect(!notJson.ok && notJson.errors[0]).toContain("Not valid JSON");

  expect(repo.importJson("[1,2,3]").ok).toBe(false);
  expect(repo.importJson(JSON.stringify({ version: 99, id: "x" }))).toMatchObject({ ok: false });

  const p = samplePortfolio();
  const negative = { ...p, transactions: [{ ...p.transactions[0], quantity: -2 }] };
  const res = repo.importJson(JSON.stringify(negative));
  expect(res.ok).toBe(false);
  expect(!res.ok && res.errors.join(" ")).toContain("Quantity");
});

test("import drops unknown keys and never trusts prototype fields", () => {
  const repo = new LocalPortfolioRepository(memoryStorage(), NOW);
  const p = samplePortfolio();
  const text = JSON.stringify({ ...p, evil: true, transactions: [{ ...p.transactions[0], extra: "x" }] }).replace(
    "\"evil\":true",
    "\"__proto__\":{\"polluted\":true}",
  );
  const res = repo.importJson(text);
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(Object.keys(res.portfolio)).not.toContain("__proto__");
  expect(Object.keys(res.portfolio.transactions[0])).not.toContain("extra");
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("unavailable or full storage never throws", () => {
  const none = new LocalPortfolioRepository(null, NOW);
  expect(none.loadStatus().status).toBe("unavailable");
  expect(none.save(samplePortfolio())).toMatchObject({ ok: false, reason: "unavailable" });

  const throwing: StorageLike = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      const e = new Error("exceeded the quota");
      e.name = "QuotaExceededError";
      throw e;
    },
    removeItem: () => undefined,
  };
  const repo = new LocalPortfolioRepository(throwing, NOW);
  expect(repo.loadStatus().status).toBe("unavailable");
  expect(repo.save(samplePortfolio())).toMatchObject({ ok: false, reason: "quota" });
});
