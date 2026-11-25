/**
 * One model turn over the streaming beta Messages API, with server-side refusal fallback,
 * pause_turn continuation and stop_reason handling. Shared by analyst.ts and structured.ts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  MessageCreateParamsBase,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AiError, toAiError } from "./errors";
import { FALLBACK_BETA, modelSupport } from "./client";
import { aiLedger } from "./budget";
import { visitorKey } from "./credentials";

export type Effort = "low" | "medium" | "high";

export const EFFORTS: readonly Effort[] = ["low", "medium", "high"];

/** Server tools can pause a long turn; resend up to this many times before giving up. */
const MAX_CONTINUATIONS = 2;

export type TurnRequest = Omit<MessageCreateParamsBase, "messages" | "betas" | "fallbacks" | "stream"> & {
  userContent: string;
};

export type TurnResult = {
  /** All content blocks of the assistant turn, across pause_turn continuations, in order. */
  content: BetaContentBlock[];
  final: BetaMessage;
  /** Model that produced the final message (differs from the requested model after a fallback). */
  model: string;
  fallbackRan: boolean;
  /** True when the turn was still paused after MAX_CONTINUATIONS resends. */
  stillPaused: boolean;
};

export type TurnHooks = { onText?: (delta: string) => void; signal?: AbortSignal; scope?: string };

/**
 * Blocks to echo back when continuing a paused turn. After a mid-output fallback, blocks before the final
 * fallback block that the fallback model cannot take (thinking, tool_use, unpaired server_tool_use) are omitted;
 * the fallback block itself stays where it was (per the refusals-and-fallback guide).
 */
export function echoableContent(content: readonly BetaContentBlock[]): BetaContentBlockParam[] {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  const pairedIds = new Set(
    content.flatMap((b) => ("tool_use_id" in b && typeof b.tool_use_id === "string" ? [b.tool_use_id] : [])),
  );
  const kept = content.filter((b, i) => {
    if (i >= lastFallback) return true;
    if (b.type === "thinking" || b.type === "redacted_thinking" || b.type === "tool_use") return false;
    if (b.type === "server_tool_use") return pairedIds.has(b.id);
    return true;
  });
  // Response blocks are structurally valid params; the SDK types differ only in optional/nullable fields.
  return kept as unknown as BetaContentBlockParam[];
}

function refusalMessage(msg: BetaMessage): string {
  const category = msg.stop_details?.category;
  const base = "The AI declined to answer this request";
  return category ? `${base} (policy category: ${category}). Try rephrasing the question.` : `${base}. Try rephrasing the question.`;
}

function fallbackRan(msg: BetaMessage): boolean {
  return (msg.usage.iterations ?? []).some((it) => it.type === "fallback_message");
}

/** Runs one assistant turn to completion. Throws AiError (refused, upstream...) on failure. */
export async function runTurn(client: Anthropic, req: TurnRequest, hooks: TurnHooks = {}): Promise<TurnResult> {
  const { userContent, ...params } = req;
  const user: BetaMessageParam = { role: "user", content: userContent };
  let content: BetaContentBlock[] = [];
  let anyFallback = false;
  const fallback = modelSupport(params.model).serverFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};
  try {
    for (let attempt = 0; ; attempt++) {
      // Every request (including pause_turn continuations) is checked against the weekly budget first.
      if (!visitorKey()) aiLedger.assertAvailable();
      const messages: BetaMessageParam[] =
        content.length === 0 ? [user] : [user, { role: "assistant", content: echoableContent(content) }];
      const stream = client.beta.messages.stream({ ...params, messages, ...fallback }, { signal: hooks.signal });
      if (hooks.onText) stream.on("text", hooks.onText);
      const msg = await stream.finalMessage();
      const usd = visitorKey() ? 0 : aiLedger.record(msg.model, msg.usage);
      console.info(
        `[${hooks.scope ?? "ai"}] ${msg.model} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} ` +
          `cacheRead=${msg.usage.cache_read_input_tokens ?? 0} searches=${msg.usage.server_tool_use?.web_search_requests ?? 0} ` +
          `est=$${usd.toFixed(4)} week=$${aiLedger.spent().toFixed(3)}`,
      );
      content = [...content, ...msg.content];
      anyFallback = anyFallback || fallbackRan(msg);

      if (msg.stop_reason === "refusal") {
        // Whole fallback chain declined. Discard any partial output.
        throw new AiError("refused", refusalMessage(msg));
      }
      if (msg.stop_reason === "pause_turn" && attempt < MAX_CONTINUATIONS) continue;
      return {
        content,
        final: msg,
        model: msg.model,
        fallbackRan: anyFallback,
        stillPaused: msg.stop_reason === "pause_turn",
      };
    }
  } catch (err) {
    throw toAiError(err, hooks.scope);
  }
}

/** Plain-language warnings for non-terminal stop reasons. */
export function stopWarnings(turn: TurnResult): string[] {
  const w: string[] = [];
  const reason = turn.final.stop_reason;
  if (reason === "max_tokens") w.push("The answer hit its length limit and may be cut off at the end.");
  if (reason === "model_context_window_exceeded") w.push("The supplied data was too large; the answer may be incomplete.");
  if (turn.stillPaused) w.push("Web research was stopped before it finished; the answer may be incomplete.");
  if (turn.fallbackRan) w.push(`This answer was produced by the fallback model ${turn.model}.`);
  return w;
}

export function textOf(content: readonly BetaContentBlock[]): string {
  return content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
