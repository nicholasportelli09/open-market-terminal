/**
 * Machine-readable AI output via structured outputs (output_config.format json_schema).
 * No web search here (structured outputs and citations do not mix); feed sourced data as context docs.
 */
import { aiModel, getClient } from "./client";
import { withProviderFallback } from "./fallback";
import { geminiGenerate } from "./gemini";
import { AiError, notConfiguredError } from "./errors";
import type { ContextDoc } from "./parse";
import { STRUCTURED_SYSTEM, formatContext, marketDate } from "./prompt";
import { EFFORTS, runTurn, textOf, type Effort } from "./request";

/** A JSON schema object. Every object in it must set additionalProperties: false (API requirement). */
export type JsonSchema = { [key: string]: unknown };

export type StructuredRequest<T> = {
  task: string;
  prompt: string;
  context: ContextDoc[];
  schema: JsonSchema;
  effort?: Effort;
  /** Includes thinking tokens. Default 8000. */
  maxTokens?: number;
  /** Optional extra check beyond required keys (e.g. enum values, array lengths). */
  validate?: (value: unknown) => value is T;
  signal?: AbortSignal;
};

const DEFAULT_MAX_TOKENS = 6_000;
const MAX_DEPTH = 12;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walks the schema and value together and returns the first path whose required key is missing
 * (or whose type is plainly wrong for object/array). Null is accepted wherever the schema allows it
 * via anyOf / type arrays, so this only checks what it can see.
 */
export function missingRequired(schema: JsonSchema, value: unknown, path = "$", depth = 0): string | null {
  if (depth > MAX_DEPTH) return null;
  const type = schema.type;
  if (type === "object" || (schema.properties && !type)) {
    if (!isObject(value)) return `${path} is not an object`;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) if (!(key in value)) return `${path}.${key} is missing`;
    const props = isObject(schema.properties) ? schema.properties : {};
    for (const [key, sub] of Object.entries(props)) {
      if (!(key in value) || value[key] === null || !isObject(sub)) continue;
      const miss = missingRequired(sub, value[key], `${path}.${key}`, depth + 1);
      if (miss) return miss;
    }
    return null;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return `${path} is not an array`;
    if (!isObject(schema.items)) return null;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === null) continue;
      const miss = missingRequired(schema.items, value[i], `${path}[${i}]`, depth + 1);
      if (miss) return miss;
    }
  }
  return null;
}

/** Run a structured call and return the parsed, checked value. Throws AiError on any failure. */
export async function runStructured<T>(req: StructuredRequest<T>): Promise<T> {
  if (!req.prompt?.trim()) throw new AiError("bad_request", "Missing prompt.");
  const effort: Effort = req.effort && EFFORTS.includes(req.effort) ? req.effort : "low";
  const today = marketDate();
  const userText = [`Today is ${today} (US Eastern time).`, formatContext(req.context), req.prompt.trim()].join("\n\n");
  return withProviderFallback(
    "ai.structured",
    (provider) => (provider === "gemini" ? structuredGemini(req, userText, effort) : structuredAnthropic(req, userText, effort)),
    { signal: req.signal },
  );
}

async function structuredGemini<T>(req: StructuredRequest<T>, userText: string, effort: Effort): Promise<T> {
  const result = await geminiGenerate({
    model: aiModel("gemini"),
    system: `${STRUCTURED_SYSTEM}\n\nTask: ${req.task.trim() || "Fill the schema."}`,
    user: userText,
    maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    effort,
    jsonSchema: req.schema,
    signal: req.signal,
    scope: "ai.structured",
  });
  if (result.truncated) throw new AiError("bad_output", "The AI output was cut off before it was complete.");
  return checkStructured(req, result.text);
}

async function structuredAnthropic<T>(req: StructuredRequest<T>, userText: string, effort: Effort): Promise<T> {
  const client = getClient();
  if (!client) throw notConfiguredError();
  const turn = await runTurn(
    client,
    {
      model: aiModel("anthropic"),
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: [
        { type: "text", text: STRUCTURED_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Task: ${req.task.trim() || "Fill the schema."}` },
      ],
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema: req.schema } },
      userContent: userText,
    },
    { signal: req.signal, scope: "ai.structured" },
  );

  if (turn.final.stop_reason === "max_tokens") {
    throw new AiError("bad_output", "The AI output was cut off before it was complete.");
  }
  return checkStructured(req, textOf(turn.content));
}

/** Parses JSON output and checks required keys and the caller's validator. Throws AiError bad_output. */
function checkStructured<T>(req: StructuredRequest<T>, text: string): T {
  const raw = text.trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AiError("bad_output", "The AI returned output that is not valid JSON.");
  }
  const miss = missingRequired(req.schema, value);
  if (miss) throw new AiError("bad_output", `The AI output did not match the expected shape (${miss}).`);
  if (req.validate && !req.validate(value)) throw new AiError("bad_output", "The AI output failed validation.");
  return value as T;
}
