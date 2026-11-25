"use client";

/**
 * Browser Supabase client (one per tab). The session lives in this browser's localStorage under Supabase's own key.
 * PKCE flow: a sign-in link only completes in the browser that asked for it (it needs the code verifier stored
 * here), so nobody can sign this browser into their own account by sending a crafted link.
 */
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { ownKeyHeaders } from "@/lib/client/ai-key";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "./config";

let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !supabaseConfigured()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/**
 * Headers for AI requests: the sign-in token when signed in, plus the visitor's own AI key when one is saved
 * (the server then uses that key instead of its own). Empty when neither. Never throws.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const own = ownKeyHeaders();
  try {
    const { data } = (await browserSupabase()?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, ...own } : own;
  } catch {
    return own;
  }
}
