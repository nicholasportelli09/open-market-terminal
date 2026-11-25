import { expect, test } from "@playwright/test";
import { createLedger, estimateCostUsd } from "@/lib/server/ai/budget";
import { DEFAULT_MODEL, modelSupport } from "@/lib/server/ai/client";
import { createCallBudget, fmpDailyLimitFromEnv, ProviderError } from "@/lib/server/analyst/providers";

test("default model is Haiku 5.5, which uses the basic web search and no server-side fallback", () => {
  expect(DEFAULT_MODEL).toBe("claude-haiku-5-5");
  expect(modelSupport("claude-haiku-5-5")).toEqual({ dynamicWebSearch: false, serverFallback: false });
  expect(modelSupport("claude-opus-5-5")).toEqual({ dynamicWebSearch: true, serverFallback: true });
  expect(modelSupport("claude-sonnet-5-5")).toEqual({ dynamicWebSearch: true, serverFallback: true });
});

test("cost estimate: Haiku 5.5 tokens plus $0.01 per web search", () => {
  // 10k in x $0.10/M = $0.001; 2k out x $0.50/M = $0.001; 2 searches = $0.02
  const usd = estimateCostUsd("claude-haiku-5-5", {
    input_tokens: 10_000,
    output_tokens: 2_000,
    server_tool_use: { web_search_requests: 2 },
  });
  expect(usd).toBeCloseTo(0.022, 6);
});

test("cost estimate: cache writes 1.25x, cache reads 0.1x, long Haiku prompts 5x, unknown models priced high", () => {
  expect(estimateCostUsd("claude-haiku-5-5", { cache_creation_input_tokens: 100_000 })).toBeCloseTo(0.0125, 6);
  expect(estimateCostUsd("claude-haiku-5-5", { cache_read_input_tokens: 100_000 })).toBeCloseTo(0.001, 6);
  expect(estimateCostUsd("claude-haiku-5-5", { input_tokens: 200_000 })).toBeCloseTo(0.1, 6);
  expect(estimateCostUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(24, 6);
  expect(estimateCostUsd("some-future-model", { output_tokens: 1_000_000 })).toBeCloseTo(50, 6);
});

test("weekly ledger blocks once the budget is reached and frees up after 7 days", () => {
  let t = 1_000_000_000_000;
  const ledger = createLedger(() => 0.05, () => t);
  ledger.assertAvailable();
  ledger.record("claude-haiku-5-5", { server_tool_use: { web_search_requests: 3 } }); // $0.03
  ledger.assertAvailable();
  ledger.record("claude-haiku-5-5", { server_tool_use: { web_search_requests: 2 } }); // $0.05 total
  expect(ledger.spent()).toBeCloseTo(0.05, 6);
  expect(() => ledger.assertAvailable()).toThrow(/AI budget/);
  t += 7 * 86_400_000 + 1;
  expect(ledger.spent()).toBe(0);
  ledger.assertAvailable();
});

test("FMP call budget: rolling 24 hours, never above the plan's 250", () => {
  let t = 0;
  const budget = createCallBudget("fmp", () => 3, () => t);
  budget.take();
  budget.take();
  budget.take();
  expect(budget.used()).toBe(3);
  let err: unknown = null;
  try {
    budget.take();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ProviderError);
  expect((err as ProviderError).kind).toBe("rate_limit");
  t += 86_400_000 + 1;
  budget.take();
  expect(budget.used()).toBe(1);

  const prev = process.env.FMP_DAILY_LIMIT;
  try {
    process.env.FMP_DAILY_LIMIT = "1000";
    expect(fmpDailyLimitFromEnv()).toBe(250);
    process.env.FMP_DAILY_LIMIT = "abc";
    expect(fmpDailyLimitFromEnv()).toBe(200);
    delete process.env.FMP_DAILY_LIMIT;
    expect(fmpDailyLimitFromEnv()).toBe(200);
  } finally {
    if (prev === undefined) delete process.env.FMP_DAILY_LIMIT;
    else process.env.FMP_DAILY_LIMIT = prev;
  }
});
