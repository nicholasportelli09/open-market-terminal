/** Shared request handling for the AI research routes: body parsing, config check, rate guard. */
import type { NextResponse } from "next/server";
import type { ApiError } from "@/lib/api-types";
import { aiConfigured, aiKeyEnv } from "@/lib/server/ai/client";
import { type VisitorKey, readVisitorKey, visitorKey } from "@/lib/server/ai/credentials";
import { guardAiRequest } from "@/lib/server/ai/guard";
import { badRequest, notConfigured, rateLimited } from "@/lib/server/api";
import { requireAiUser } from "@/lib/server/auth";

const MAX_BODY_BYTES = 32_000;

/** Parsed JSON body, or an error response. An empty body is `undefined`. */
export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse<ApiError> }> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, res: badRequest("Request body is too large.") };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, res: badRequest("Could not read the request body.") };
  }
  if (text.length > MAX_BODY_BYTES) return { ok: false, res: badRequest("Request body is too large.") };
  if (!text.trim()) return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: badRequest("Request body is not valid JSON.") };
  }
}

export function aiNotConfigured(message = "AI research needs an AI API key on the server."): NextResponse<ApiError> | null {
  return aiConfigured() ? null : notConfigured(message, [aiKeyEnv()]);
}

/**
 * Who pays for this AI request: the visitor's own key (sent in headers; no sign-in needed) or the server's keys
 * (owner's account only, see auth.ts). Run the rest of the handler inside withVisitorKey(access.key, ...).
 */
export async function aiAccess(req: Request): Promise<{ ok: true; key: VisitorKey | null } | { ok: false; res: NextResponse<ApiError> }> {
  const own = readVisitorKey(req);
  if (!own.ok) return { ok: false, res: badRequest(own.error) };
  if (own.value) return { ok: true, key: own.value };
  const denied = await requireAiUser(req);
  return denied ? { ok: false, res: denied } : { ok: true, key: null };
}

/** 429 with Retry-After when this IP or the instance's daily cap is exhausted. Call inside withVisitorKey. */
export function guardOrLimit(req: Request): NextResponse<ApiError> | null {
  const g = guardAiRequest(req, visitorKey() !== null);
  if (g.allowed) return null;
  const msg = g.reason === "daily_cap" ? "The daily AI limit for this server has been reached." : "Too many AI requests from this address. Wait a few minutes.";
  return rateLimited(msg, g.retryAfterSec);
}
