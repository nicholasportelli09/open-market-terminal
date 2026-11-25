/**
 * Google Gemini (Gemini API, free tier) over REST generateContent. Server-only; the key is sent in the
 * x-goog-api-key header so it never appears in a URL or log line.
 *
 * Free tier facts (Gemini API docs, Nov 2026): input and output tokens are free on gemini-3.8-flash and
 * gemini-3.5-flash-lite; Grounding with Google Search is NOT available on the free tier, so this adapter never
 * sends a search tool. Free-tier prompts may be used by Google to improve its products.
 */
import { aiLedger } from "./budget";
import { geminiKey } from "./client";
import { keyOwnerLabel, visitorKey } from "./credentials";
import { AiError, notConfiguredError } from "./errors";
import type { Effort } from "./request";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 120_000;
const DEFAULT_RETRY_SEC = 60;

/** finishReason values that mean the request or answer was blocked by Google's safety systems. */
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

const THINKING_LEVEL: Record<Effort, string> = { low: "LOW", medium: "MEDIUM", high: "HIGH" };

export type GeminiRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  effort: Effort;
  /** JSON schema for structured output (responseMimeType application/json). */
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  scope?: string;
};

export type GeminiResult = {
  text: string;
  /** Model version Google reports, else the requested model. */
  model: string;
  /** True when the answer stopped at maxOutputTokens. */
  truncated: boolean;
};

type Part = { text?: string; thought?: boolean };
type GeminiResponse = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
  error?: { code?: number; message?: string; status?: string };
};

export function geminiBody(req: GeminiRequest): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      thinkingConfig: { thinkingLevel: THINKING_LEVEL[req.effort] },
      ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
    },
  };
}

/** Answer text (thought summaries excluded), or an AiError for blocked / empty responses. */
export function readGeminiResponse(body: GeminiResponse, requestedModel: string): GeminiResult {
  const blockReason = body.promptFeedback?.blockReason;
  if (blockReason) throw new AiError("refused", `Google's safety filter declined this request (${blockReason}). Try rephrasing.`);
  const cand = body.candidates?.[0];
  const reason = cand?.finishReason ?? "";
  if (BLOCKED.has(reason)) throw new AiError("refused", `Google's safety filter stopped the answer (${reason}). Try rephrasing.`);
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const truncated = reason === "MAX_TOKENS";
  if (!text.trim()) {
    throw new AiError("bad_output", truncated ? "The AI used its whole length budget before answering. Try again." : "The AI returned an empty answer. Try again.");
  }
  return { text, model: body.modelVersion || requestedModel, truncated };
}

function retryAfter(res: Response): number {
  const n = Number(res.headers.get("retry-after"));
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : DEFAULT_RETRY_SEC;
}

function httpError(res: Response, body: GeminiResponse, scope: string): AiError {
  const detail = body.error?.message ?? "";
  console.error(`[${scope}] Gemini HTTP ${res.status} ${body.error?.status ?? ""}: ${detail.slice(0, 300)}`);
  if (res.status === 429) {
    return new AiError("rate_limited", "Google's free Gemini quota is used up for now. Try again later (daily limits reset at midnight Pacific).", {
      retryAfterSec: retryAfter(res),
    });
  }
  if (res.status === 401 || res.status === 403) return new AiError("upstream", `Google rejected ${keyOwnerLabel()} Gemini API key.`);
  if (res.status === 400 && /api key/i.test(detail)) return new AiError("upstream", `Google rejected ${keyOwnerLabel()} Gemini API key.`);
  return new AiError("upstream", "The AI provider returned an error. Try again shortly.");
}

/** One generateContent call (free tier, so not gated by the weekly budget; usage is still logged). Throws AiError. */
export async function geminiGenerate(req: GeminiRequest): Promise<GeminiResult> {
  const key = geminiKey();
  if (!key) throw notConfiguredError();
  const scope = req.scope ?? "ai.gemini";
  const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/${encodeURIComponent(req.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(geminiBody(req)),
      cache: "no-store",
      signal,
    });
  } catch (err) {
    console.error(`[${scope}] Gemini request failed: ${err instanceof Error ? err.name : "network"}`);
    throw new AiError("upstream", "Could not reach the AI provider. Try again shortly.", { cause: err });
  }

  let body: GeminiResponse;
  try {
    body = (await res.json()) as GeminiResponse;
  } catch {
    body = {};
  }
  if (!res.ok) throw httpError(res, body, scope);

  const u = body.usageMetadata ?? {};
  const usage = {
    input_tokens: (u.promptTokenCount ?? 0) - (u.cachedContentTokenCount ?? 0),
    cache_read_input_tokens: u.cachedContentTokenCount ?? 0,
    output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  };
  const model = body.modelVersion || req.model;
  // A visitor's own key is not charged to the server's budget.
  const usd = visitorKey() ? 0 : aiLedger.record(model, usage);
  console.info(
    `[${scope}] ${model} in=${u.promptTokenCount ?? 0} out=${u.candidatesTokenCount ?? 0} thoughts=${u.thoughtsTokenCount ?? 0} ` +
      `finish=${body.candidates?.[0]?.finishReason ?? "?"} est=$${usd.toFixed(4)} week=$${aiLedger.spent().toFixed(3)}`,
  );
  return readGeminiResponse(body, req.model);
}
