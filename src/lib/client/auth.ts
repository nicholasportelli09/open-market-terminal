"use client";

/**
 * Sign-in state for the whole app, from Supabase's auth events. Starting sync on sign-in and stopping it on
 * sign-out happens here so every page gets it from the top bar.
 */
import { useSyncExternalStore } from "react";
import { startSync, stopSync } from "@/lib/sync/engine";
import { browserSupabase } from "@/lib/supabase/browser";

export type AuthState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; email: string | null };

const LOADING: AuthState = { status: "loading" };
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  const same =
    next.status === state.status && (next.status !== "signed-in" || (state.status === "signed-in" && state.userId === next.userId && state.email === next.email));
  if (same) return;
  state = next;
  for (const fn of listeners) fn();
}

function init() {
  if (started) return;
  started = true;
  const sb = browserSupabase();
  if (!sb) {
    set({ status: "off" });
    return;
  }
  sb.auth.onAuthStateChange((_event, session) => {
    // Supabase warns against awaiting its own calls inside this callback; defer the work.
    setTimeout(() => {
      if (session?.user) {
        set({ status: "signed-in", userId: session.user.id, email: session.user.email ?? null });
        startSync(sb, session.user.id);
      } else {
        set({ status: "signed-out" });
        stopSync();
      }
    }, 0);
  });
}

function subscribe(fn: () => void) {
  init();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** Email a one-time sign-in link that returns to the current page. It must be opened in this same browser (PKCE). */
export async function sendSignInLink(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = browserSupabase();
  if (!sb) return { ok: false, message: "Sign-in is not set up on this server." };
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
  if (!error) return { ok: true };
  if (error.status === 429 || /rate limit/i.test(error.message)) return { ok: false, message: "Too many sign-in emails were sent recently. Wait a few minutes and try again." };
  return { ok: false, message: "The sign-in email could not be sent. Check the address and try again." };
}

export async function signOut(): Promise<void> {
  await browserSupabase()?.auth.signOut();
}
