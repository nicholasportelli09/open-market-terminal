import { expect, test } from "@playwright/test";
import { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL, aiModel, aiProviders, geminiKey, getClient } from "@/lib/server/ai/client";
import { readVisitorKey, visitorKey, withVisitorKey } from "@/lib/server/ai/credentials";
import { guardAiRequest } from "@/lib/server/ai/guard";

const req = (headers: Record<string, string>) => new Request("https://example.com/api/research", { method: "POST", headers });
// Built at run time so it never looks like a real Google API key to secret scanners.
const GEMINI = ["AIza", "Sy", "x".repeat(34)].join("");
const ANTHROPIC = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

test("visitor key headers are optional and validated", () => {
  expect(readVisitorKey(req({}))).toEqual({ ok: true, value: null });
  expect(readVisitorKey(req({ "x-ai-provider": "gemini", "x-ai-key": GEMINI }))).toEqual({ ok: true, value: { provider: "gemini", key: GEMINI } });
  expect(readVisitorKey(req({ "x-ai-provider": "Anthropic", "x-ai-key": ANTHROPIC }))).toEqual({ ok: true, value: { provider: "anthropic", key: ANTHROPIC } });
  expect(readVisitorKey(req({ "x-ai-provider": "anthropic", "x-ai-key": GEMINI })).ok).toBe(false);
  expect(readVisitorKey(req({ "x-ai-provider": "openai", "x-ai-key": ANTHROPIC })).ok).toBe(false);
  expect(readVisitorKey(req({ "x-ai-key": GEMINI })).ok).toBe(false);
  expect(readVisitorKey(req({ "x-ai-provider": "gemini", "x-ai-key": "short" })).ok).toBe(false);
});

test("inside withVisitorKey only the visitor's key and default model are used", async () => {
  const saved = { g: process.env.GEMINI_API_KEY, a: process.env.ANTHROPIC_API_KEY, m: process.env.ANTHROPIC_MODEL };
  process.env.GEMINI_API_KEY = "server-gemini-key-000000000000000000";
  process.env.ANTHROPIC_API_KEY = "sk-ant-server-0000000000000000000000";
  process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
  try {
    await withVisitorKey({ provider: "gemini", key: GEMINI }, async () => {
      expect(aiProviders()).toEqual(["gemini"]);
      expect(geminiKey()).toBe(GEMINI);
      expect(getClient()).toBeNull();
      expect(aiModel("gemini")).toBe(DEFAULT_GEMINI_MODEL);
    });
    await withVisitorKey({ provider: "anthropic", key: ANTHROPIC }, async () => {
      expect(aiProviders()).toEqual(["anthropic"]);
      expect(geminiKey()).toBeNull();
      expect(getClient()?.apiKey).toBe(ANTHROPIC);
      expect(aiModel("anthropic")).toBe(DEFAULT_MODEL);
    });
    // Outside, the server's own configuration applies again.
    expect(visitorKey()).toBeNull();
    expect(aiProviders()).toEqual(["gemini", "anthropic"]);
    expect(aiModel("anthropic")).toBe("claude-opus-5-5");
  } finally {
    for (const [k, v] of [["GEMINI_API_KEY", saved.g], ["ANTHROPIC_API_KEY", saved.a], ["ANTHROPIC_MODEL", saved.m]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("visitor-key requests have their own, looser per-IP limit", () => {
  const ip = { "x-forwarded-for": "203.0.113.77" };
  for (let i = 0; i < 6; i++) expect(guardAiRequest(req(ip)).allowed).toBe(true);
  expect(guardAiRequest(req(ip)).allowed).toBe(false);
  // The owner's limit being used up does not block the visitor's own key.
  expect(guardAiRequest(req(ip), true).allowed).toBe(true);
});

test("without sign-in configured, a production build keeps the server's AI keys locked", async () => {
  const { openWithoutAuth } = await import("@/lib/server/auth");
  expect(openWithoutAuth({ NODE_ENV: "development" })).toBe(true);
  expect(openWithoutAuth({ NODE_ENV: "production" })).toBe(false);
  expect(openWithoutAuth({ NODE_ENV: "production", AI_OPEN_WITHOUT_AUTH: "1" })).toBe(true);
  // An allowlist without sign-in can never be honoured, so it locks the keys even in development.
  expect(openWithoutAuth({ NODE_ENV: "development", AI_ALLOWED_USER_IDS: "abc" })).toBe(false);
});

test("AI answers are cached per payer, so server-paid answers never reach a visitor-key request", async () => {
  const { payerScope } = await import("@/lib/server/ai/credentials");
  const { briefingKey } = await import("@/lib/server/research/briefing");
  const now = new Date("2026-11-25T12:00:00Z");
  expect(payerScope()).toBe("owner");
  const ownerKey = briefingKey(undefined, now);
  const visitor = await withVisitorKey({ provider: "gemini", key: GEMINI }, async () => [payerScope(), briefingKey(undefined, now)] as const);
  expect(visitor[0]).toMatch(/^visitor-[0-9a-f]{32}$/);
  expect(visitor[0]).not.toContain(GEMINI);
  expect(visitor[1]).not.toBe(ownerKey);
});
