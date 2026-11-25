import { expect, test } from "@playwright/test";
import { AiError, aiErrorToResponse } from "@/lib/server/ai/errors";
import { missingRequired } from "@/lib/server/ai/structured";
import { runAnalyst } from "@/lib/server/ai/analyst";
import { aiConfigured, getClient } from "@/lib/server/ai/client";

test("AiError maps to the ApiResult envelope with the right status", async () => {
  const nc = aiErrorToResponse(new AiError("not_configured", "x"));
  expect(nc.status).toBe(503);
  expect(await nc.json()).toEqual({ ok: false, code: "not_configured", message: "x", missingEnv: ["GEMINI_API_KEY"] });

  const rl = aiErrorToResponse(new AiError("rate_limited", "slow down", { retryAfterSec: 42 }));
  expect(rl.status).toBe(429);
  expect(rl.headers.get("Retry-After")).toBe("42");

  expect(aiErrorToResponse(new AiError("refused", "no")).status).toBe(422);
  expect(aiErrorToResponse(new AiError("bad_output", "no")).status).toBe(502);
  expect(aiErrorToResponse(new AiError("bad_request", "no")).status).toBe(400);
  const unknown = aiErrorToResponse(new Error("boom"), "test");
  expect(unknown.status).toBe(502);
  expect((await unknown.json()).code).toBe("upstream");
});

test("without ANTHROPIC_API_KEY the analyst reports not_configured instead of answering", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    expect(aiConfigured()).toBe(false);
    expect(getClient()).toBeNull();
    const err = await runAnalyst({ task: "t", question: "q", context: [], webSearch: { enabled: false } }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe("not_configured");
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test("missingRequired checks required keys through nested objects and arrays", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "items"],
    properties: {
      summary: { type: "string" },
      items: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" } } },
      },
    },
  };
  expect(missingRequired(schema, { summary: "s", items: [{ name: "a" }] })).toBeNull();
  expect(missingRequired(schema, { summary: "s" })).toBe("$.items is missing");
  expect(missingRequired(schema, { summary: "s", items: [{}] })).toBe("$.items[0].name is missing");
  expect(missingRequired(schema, [])).toBe("$ is not an object");
});
