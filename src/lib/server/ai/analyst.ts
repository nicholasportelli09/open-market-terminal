/**
 * Research analyst: answers a question from OUR sourced data (+ optional web search) as labelled,
 * cited claims. Every number must trace to a supplied doc (S#) or a web citation (W#).
 */
import type {
  BetaContentBlock,
  BetaWebSearchTool20250305,
  BetaWebSearchTool20260209,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AnalystAnswer } from "@/lib/ai/types";
import { aiModel, getClient, modelSupport } from "./client";
import { withProviderFallback } from "./fallback";
import { geminiGenerate } from "./gemini";
import { AiError, notConfiguredError } from "./errors";
import { parseAnalystMessage, type ContextDoc } from "./parse";
import { ANALYST_SYSTEM, SEARCH_NUDGE, formatContext, marketDate } from "./prompt";
import { EFFORTS, runTurn, stopWarnings, type Effort } from "./request";
import { limitsInstruction, trimAnswer, type LineLimits } from "./trim";

export { parseAnalystMessage, type ContextDoc, type ParsedAnalyst } from "./parse";

export type WebSearchOptions = {
  enabled: boolean;
  /** Searches allowed in this answer (default 3, clamped 1..8). */
  maxUses?: number;
  /** Restrict results to these domains (e.g. ["sec.gov", "reuters.com"]). */
  allowedDomains?: string[];
};

export type AnalystRequest = {
  /** Short system role for this feature, e.g. "Explain today's move in one stock." */
  task: string;
  question: string;
  context: ContextDoc[];
  webSearch: WebSearchOptions;
  effort?: Effort;
  /** Length cap: told to the model and enforced on the parsed answer. */
  limits?: LineLimits;
  /** Includes thinking tokens (thinking is always on). Default 6000. */
  maxTokens?: number;
  /**
   * Text deltas as they stream: raw, provisional model text (tags included, before parsing). Lines may later be
   * downgraded or removed, and a refused turn's partial text is discarded. Show it only as a "writing..." preview
   * and replace it with the parsed answer; never render it as labelled claims.
   */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
};

const MAX_QUESTION_CHARS = 4_000;
const MAX_TASK_CHARS = 600;
const MAX_CONTEXT_CHARS = 400_000;
/** Includes thinking; low effort keeps thinking short. Kept tight to bound cost per answer. */
const DEFAULT_MAX_TOKENS = 6_000;
/** Each search costs $0.01 plus its result tokens, the largest cost of an answer on a cheap model. */
const DEFAULT_SEARCHES = 2;
const MAX_SEARCHES = 3;
const DOC_ID_RE = /^S\d{1,3}$/;

function validate(req: AnalystRequest): void {
  const question = req.question?.trim() ?? "";
  if (!question) throw new AiError("bad_request", "Ask a question first.");
  if (question.length > MAX_QUESTION_CHARS) throw new AiError("bad_request", `Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
  if ((req.task ?? "").length > MAX_TASK_CHARS) throw new AiError("bad_request", "Task description is too long.");
  const ids = new Set<string>();
  let size = 0;
  for (const d of req.context) {
    if (!DOC_ID_RE.test(d.id) || ids.has(d.id)) throw new AiError("bad_request", `Invalid or duplicate context id "${d.id}".`);
    ids.add(d.id);
    size += d.content.length;
  }
  if (size > MAX_CONTEXT_CHARS) throw new AiError("bad_request", "Too much context data for one question.");
}

/** Dynamic-filtering search on models that support it; the basic tool (e.g. on Haiku 5.5) otherwise. */
function webSearchTool(opts: WebSearchOptions, model: string): BetaWebSearchTool20260209 | BetaWebSearchTool20250305 {
  const maxUses = Math.min(MAX_SEARCHES, Math.max(1, Math.floor(opts.maxUses ?? DEFAULT_SEARCHES)));
  const domains = (opts.allowedDomains ?? []).map((d) => d.trim()).filter(Boolean);
  const extra = { max_uses: maxUses, ...(domains.length ? { allowed_domains: domains } : {}) };
  return modelSupport(model).dynamicWebSearch
    ? { type: "web_search_20260209", name: "web_search", ...extra }
    : { type: "web_search_20250305", name: "web_search", ...extra };
}

function userContent(req: AnalystRequest, today: string): string {
  const parts = [
    `Today is ${today} (US Eastern time).`,
    req.webSearch.enabled
      ? SEARCH_NUDGE
      : "Web search is not available for this question: ignore any instruction to search the web and use only the supplied documents (including any headlines). Where they do not cover something, say so.",
    formatContext(req.context),
    `Question: ${req.question.trim()}`,
    req.limits ? limitsInstruction(req.limits) : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

/** Run the analyst. Throws AiError (not_configured, bad_request, refused, upstream, bad_output, rate_limited). */
export async function runAnalyst(req: AnalystRequest): Promise<AnalystAnswer> {
  validate(req);
  const effort: Effort = req.effort && EFFORTS.includes(req.effort) ? req.effort : "low";
  const answer = await withProviderFallback(
    "ai.analyst",
    (provider) => (provider === "gemini" ? runAnalystGemini(req, aiModel("gemini"), effort) : runAnalystAnthropic(req, aiModel("anthropic"), effort)),
    { signal: req.signal },
  );
  return req.limits ? trimAnswer(answer, req.limits) : answer;
}

async function runAnalystAnthropic(req: AnalystRequest, model: string, effort: Effort): Promise<AnalystAnswer> {
  const client = getClient();
  if (!client) throw notConfiguredError();
  const turn = await runTurn(
    client,
    {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: [
        { type: "text", text: ANALYST_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Task: ${req.task.trim() || "Answer the question."}` },
      ],
      thinking: { type: "adaptive" },
      output_config: { effort },
      ...(req.webSearch.enabled ? { tools: [webSearchTool(req.webSearch, model)] } : {}),
      userContent: userContent(req, marketDate()),
    },
    { onText: req.onText, signal: req.signal, scope: "ai.analyst" },
  );

  const parsed = parseAnalystMessage(turn.content, req.context);
  if (parsed.sections.length === 0) {
    throw new AiError("bad_output", "The AI returned no usable answer. Try again.");
  }
  return {
    ...parsed,
    model: turn.model,
    generatedAt: new Date().toISOString(),
    warnings: [...stopWarnings(turn), ...parsed.warnings],
  };
}

/**
 * Gemini path: free tier has no web search, so the model answers from the supplied documents only. The reply is
 * wrapped as one text block so the same parser labels claims and checks figures against the cited documents.
 */
async function runAnalystGemini(req: AnalystRequest, model: string, effort: Effort): Promise<AnalystAnswer> {
  const offline: AnalystRequest = { ...req, webSearch: { enabled: false } };
  const result = await geminiGenerate({
    model,
    system: `${ANALYST_SYSTEM}\n\nTask: ${req.task.trim() || "Answer the question."}`,
    user: userContent(offline, marketDate()),
    maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    effort,
    signal: req.signal,
    scope: "ai.analyst",
  });
  const content = [{ type: "text", text: result.text, citations: null }] as unknown as BetaContentBlock[];
  const parsed = parseAnalystMessage(content, req.context);
  if (parsed.sections.length === 0) {
    throw new AiError("bad_output", "The AI returned no usable answer. Try again.");
  }
  const warnings = result.truncated ? ["The answer hit its length limit and may be cut off at the end."] : [];
  return { ...parsed, model: result.model, generatedAt: new Date().toISOString(), warnings: [...warnings, ...parsed.warnings] };
}
