/**
 * Sign-in check for the AI routes that run on the server's own keys. When Supabase is configured, such requests
 * need a valid Supabase access token (Authorization: Bearer ...) of an account listed in AI_ALLOWED_USER_IDS
 * (comma-separated user ids), so strangers cannot spend the owner's AI credits. With the list empty, nobody gets
 * the server's keys unless AI_OPEN_TO_SIGNED_IN=1 opens them to every signed-in account (fail closed).
 * Visitors can always use AI with their own key (credentials.ts). Without Supabase config the server's keys stay
 * open only in development (npm run dev) or when AI_OPEN_WITHOUT_AUTH=1 is set on purpose; a production
 * deployment without sign-in never lends its keys to strangers.
 */
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import type { ApiError } from "@/lib/api-types";
import { unauthorized, upstream } from "@/lib/server/api";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";

let verifier: SupabaseClient | null = null;

function client(): SupabaseClient {
  verifier ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return verifier;
}

export function allowedUserIds(raw = process.env.AI_ALLOWED_USER_IDS): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S{20,4096})$/i.exec(req.headers.get("authorization")?.trim() ?? "");
  return m ? m[1] : null;
}

/** Shown to everyone who may not use the server's keys. */
export const OWN_KEY_HINT = "To use AI, add your own free AI key from the person icon at the top right. It stays in your browser.";

const CHECK_FAILED = "Could not check your sign-in right now. Try again shortly.";

/** Null when the request may use AI; otherwise 401 (no or rejected sign-in) or 502 (the check itself failed). */
/** Whether the server's keys may answer without sign-in (no Supabase): development, or an explicit opt-in. */
export function openWithoutAuth(env: Record<string, string | undefined> = process.env): boolean {
  if (allowedUserIds(env.AI_ALLOWED_USER_IDS).size > 0) return false;
  return env.NODE_ENV !== "production" || env.AI_OPEN_WITHOUT_AUTH?.trim() === "1";
}

export async function requireAiUser(req: Request): Promise<NextResponse<ApiError> | null> {
  if (!supabaseConfigured()) {
    if (openWithoutAuth()) return null;
    if (allowedUserIds().size > 0) console.error("[auth] AI_ALLOWED_USER_IDS is set but sign-in (Supabase) is not configured; the server's AI keys are locked.");
    return unauthorized(OWN_KEY_HINT);
  }
  const token = bearerToken(req);
  if (!token) return unauthorized(OWN_KEY_HINT);
  let userId: string | null = null;
  try {
    const { data, error } = await client().auth.getClaims(token);
    // Network trouble or a Supabase outage is not the user's fault: do not tell them their sign-in expired.
    if (error && (isAuthRetryableFetchError(error) || !error.status || error.status >= 500)) return upstream("auth", error, CHECK_FAILED);
    const sub = data?.claims?.sub;
    // Anonymous Supabase sessions also carry role "authenticated"; they never count as a signed-in account here.
    const anonymous = (data?.claims as { is_anonymous?: unknown } | undefined)?.is_anonymous === true;
    if (!error && !anonymous && typeof sub === "string" && data?.claims?.role === "authenticated") userId = sub.toLowerCase();
  } catch (err) {
    return upstream("auth", err, CHECK_FAILED);
  }
  if (!userId) return unauthorized("Your sign-in has expired. Sign in again to use the AI features.");
  const allowed = allowedUserIds();
  const openToAll = allowed.size === 0 && process.env.AI_OPEN_TO_SIGNED_IN?.trim() === "1";
  if (!openToAll && !allowed.has(userId)) return unauthorized(`AI here runs on the owner's account. ${OWN_KEY_HINT}`);
  return null;
}
