import { expect, test } from "@playwright/test";
import Anthropic from "@anthropic-ai/sdk";
import { runTurn } from "@/lib/server/ai/request";
import { AiError } from "@/lib/server/ai/errors";

/** Offline: a fake fetch that serves canned SSE turns and records each request body. */
type Turn = { texts: string[]; stop: string; stopDetails?: Record<string, unknown> };

function sse(turn: Turn, model: string): string {
  const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const usage = { input_tokens: 10, output_tokens: 5 };
  let out = ev("message_start", {
    message: { id: "msg_1", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, stop_details: null, usage },
  });
  turn.texts.forEach((t, index) => {
    out += ev("content_block_start", { index, content_block: { type: "text", text: "", citations: null } });
    out += ev("content_block_delta", { index, delta: { type: "text_delta", text: t } });
    out += ev("content_block_stop", { index });
  });
  out += ev("message_delta", { delta: { stop_reason: turn.stop, stop_sequence: null, stop_details: turn.stopDetails ?? null }, usage: { output_tokens: 5 } });
  out += ev("message_stop", {});
  return out;
}

function fakeClient(turns: Turn[]) {
  const bodies: Record<string, unknown>[] = [];
  const headers: Headers[] = [];
  const fetchImpl = async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    headers.push(new Headers(init?.headers));
    const turn = turns[Math.min(bodies.length - 1, turns.length - 1)];
    return new Response(sse(turn, "claude-opus-5-5"), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const client = new Anthropic({ apiKey: "test-key", fetch: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
  return { client, bodies, headers };
}

const REQ = {
  model: "claude-opus-5-5",
  max_tokens: 1000,
  system: [{ type: "text" as const, text: "sys", cache_control: { type: "ephemeral" as const } }],
  thinking: { type: "adaptive" as const },
  output_config: { effort: "medium" as const },
  tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3 }],
  userContent: "question",
};

test("request carries the fallback beta, fallbacks default, adaptive thinking and the web search tool", async () => {
  const { client, bodies, headers } = fakeClient([{ texts: ["[VIEW] ok"], stop: "end_turn" }]);
  const deltas: string[] = [];
  const turn = await runTurn(client, REQ, { onText: (d) => deltas.push(d) });
  expect(turn.final.stop_reason).toBe("end_turn");
  expect(deltas.join("")).toBe("[VIEW] ok");
  const body = bodies[0];
  expect(body).toMatchObject({
    model: "claude-opus-5-5",
    fallbacks: "default",
    stream: true,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [{ role: "user", content: "question" }],
  });
  expect(body).not.toHaveProperty("betas");
  expect(headers[0].get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
});

test("pause_turn is continued by resending the assistant content, without a new user message", async () => {
  const { client, bodies } = fakeClient([
    { texts: ["part one "], stop: "pause_turn" },
    { texts: ["part two"], stop: "end_turn" },
  ]);
  const turn = await runTurn(client, REQ);
  expect(bodies).toHaveLength(2);
  const msgs = bodies[1].messages as { role: string; content: unknown }[];
  expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(turn.content.map((b) => (b.type === "text" ? b.text : b.type))).toEqual(["part one ", "part two"]);
});

test("a refusal throws AiError refused with the category", async () => {
  const { client } = fakeClient([{ texts: [], stop: "refusal", stopDetails: { type: "refusal", category: "bio", explanation: null } }]);
  const err = await runTurn(client, REQ).catch((e) => e);
  expect(err).toBeInstanceOf(AiError);
  expect((err as AiError).code).toBe("refused");
  expect((err as AiError).message).toContain("bio");
});
