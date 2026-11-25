import { expect, test } from "@playwright/test";
import { estimateCostUsd } from "@/lib/server/ai/budget";
import { type AiProvider, aiKeyEnv, aiModel, aiProvider, aiProviders, getClient, providerOfModel } from "@/lib/server/ai/client";
import { AiError } from "@/lib/server/ai/errors";
import { withProviderFallback } from "@/lib/server/ai/fallback";
import { geminiBody, readGeminiResponse } from "@/lib/server/ai/gemini";

const KEYS = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ANTHROPIC_MODEL"] as const;

function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void) {
  const prev = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, values);
    fn();
  } finally {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("provider chain: Gemini first, Anthropic as fallback; AI_PROVIDER pins one", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-ant-test", GEMINI_API_KEY: "g-test" }, () => {
    expect(aiProviders()).toEqual(["gemini", "anthropic"]);
    expect(aiProvider()).toBe("gemini");
    expect(aiModel()).toBe("gemini-3.8-flash");
    expect(aiModel("anthropic")).toBe("claude-haiku-5-5");
    expect(getClient()).not.toBeNull();
  });
  withEnv({ ANTHROPIC_API_KEY: "sk-ant-test" }, () => {
    expect(aiProviders()).toEqual(["anthropic"]);
  });
  withEnv({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "sk-ant-test" }, () => {
    expect(aiProviders()).toEqual([]);
    expect(getClient()).toBeNull();
    expect(aiKeyEnv()).toBe("GEMINI_API_KEY");
  });
  withEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test", GEMINI_API_KEY: "g-test" }, () => {
    expect(aiProviders()).toEqual(["anthropic"]);
    expect(aiKeyEnv()).toBe("ANTHROPIC_API_KEY");
  });
  withEnv({ GEMINI_API_KEY: "g-test", GEMINI_MODEL: "gemini-3.5-flash-lite" }, () => {
    expect(aiModel()).toBe("gemini-3.5-flash-lite");
  });
  expect(providerOfModel("gemini-3.8-flash-001")).toBe("gemini");
  expect(providerOfModel("claude-haiku-5-5")).toBe("anthropic");
});

test("fallback: quota, upstream and bad output move to the next provider; refusals do not", async () => {
  const both = { providers: ["gemini", "anthropic"] as AiProvider[] };
  const tried: string[] = [];
  const out = await withProviderFallback("t", async (p) => {
    tried.push(p);
    if (p === "gemini") throw new AiError("rate_limited", "quota");
    return "ok";
  }, both);
  expect(out).toBe("ok");
  expect(tried).toEqual(["gemini", "anthropic"]);
  for (const code of ["upstream", "bad_output"] as const) {
    await expect(withProviderFallback("t", async (p) => (p === "gemini" ? Promise.reject(new AiError(code, "x")) : "ok"), both)).resolves.toBe("ok");
  }
  const calls: string[] = [];
  await expect(withProviderFallback("t", async (p) => { calls.push(p); throw new AiError("refused", "no"); }, both)).rejects.toThrow("no");
  expect(calls).toEqual(["gemini"]);
  await expect(withProviderFallback("t", async () => { throw new AiError("upstream", "last"); }, { providers: ["anthropic"] })).rejects.toThrow("last");
  await expect(withProviderFallback("t", async () => "x", { providers: [] })).rejects.toMatchObject({ code: "not_configured" });
});

test("Gemini request: system + user text, thinking level from effort, no search tool, JSON schema when asked", () => {
  const body = geminiBody({ model: "gemini-3.8-flash", system: "SYS", user: "Q", maxTokens: 6000, effort: "low" }) as Record<string, unknown>;
  expect(body).toEqual({
    systemInstruction: { parts: [{ text: "SYS" }] },
    contents: [{ role: "user", parts: [{ text: "Q" }] }],
    generationConfig: { maxOutputTokens: 6000, thinkingConfig: { thinkingLevel: "LOW" } },
  });
  expect(body.tools).toBeUndefined();
  const json = geminiBody({ model: "m", system: "S", user: "U", maxTokens: 10, effort: "medium", jsonSchema: { type: "object" } });
  expect(json.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: { type: "object" }, thinkingConfig: { thinkingLevel: "MEDIUM" } });
});

test("Gemini response: thoughts are dropped, blocks become refusals, MAX_TOKENS is flagged", () => {
  const ok = readGeminiResponse(
    { candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: "[FACT] A [S1]" }] }, finishReason: "STOP" }], modelVersion: "gemini-3.8-flash-001" },
    "gemini-3.8-flash",
  );
  expect(ok).toEqual({ text: "[FACT] A [S1]", model: "gemini-3.8-flash-001", truncated: false });
  expect(readGeminiResponse({ candidates: [{ content: { parts: [{ text: "x" }] }, finishReason: "MAX_TOKENS" }] }, "m").truncated).toBe(true);
  expect(() => readGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }, "m")).toThrow(/safety filter/);
  expect(() => readGeminiResponse({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] }, "m")).toThrow(/safety filter/);
  expect(() => readGeminiResponse({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] }, "m")).toThrow(/empty answer/);
});

test("Gemini free tier is recorded at $0 in the spend ledger", () => {
  expect(estimateCostUsd("gemini-3.8-flash", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(0);
});
