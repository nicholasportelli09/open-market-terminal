"use client";

import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sendSignInLink, signOut, useAuth } from "@/lib/client/auth";
import { AiKeyForm } from "./ai-key-form";
import { OPEN_AI_KEY_EVENT } from "./ai-key-prompt";
import { type Backup, KEY_LABELS, dismissBackup, listBackups, restoreBackup } from "@/lib/sync/backups";
import { type SyncStatus, applyPendingReload, syncStatus } from "@/lib/sync/engine";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OFF: SyncStatus = { state: "off", at: null, message: null, pendingReload: false };

function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get, () => OFF);
}

function ago(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`;
}

function BackupList() {
  const [list, setList] = useState<Backup[]>(() => listBackups());
  if (list.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-line pt-2.5">
      <p className="text-[12px] font-medium text-muted">Earlier copies on this device</p>
      <ul className="space-y-1.5">
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate">
              {KEY_LABELS[b.key]}{" "}
              <span className="text-faint">
                · {b.reason === "other-account" ? "from another account" : "replaced by sync"}, {ago(b.at)}
              </span>
            </span>
            <button type="button" onClick={() => restoreBackup(b.id)} className="cursor-pointer font-medium text-fg hover:underline">
              Restore
            </button>
            <button
              type="button"
              onClick={() => {
                dismissBackup(b.id);
                setList(listBackups());
              }}
              className="cursor-pointer text-faint hover:text-fg"
              aria-label={`Dismiss ${KEY_LABELS[b.key]} copy`}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const iconBtn =
  "flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg";

function PersonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
    </svg>
  );
}

function syncLine(s: SyncStatus): string {
  if (s.state === "syncing") return "Syncing...";
  if (s.state === "error") return `Sync paused: ${s.message ?? "connection problem"}. Your changes stay on this device and sync when it works again.`;
  if (s.state === "synced") {
    const when = s.at ? ago(s.at) : "just now";
    return s.message ? `Synced ${when}. Note: ${s.message}.` : `Synced ${when}.`;
  }
  return "Starting sync...";
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<{ s: "idle" } | { s: "sending" } | { s: "sent"; to: string } | { s: "error"; message: string }>({ s: "idle" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!EMAIL_RE.test(to)) return setPhase({ s: "error", message: "Enter a valid email address." });
    setPhase({ s: "sending" });
    const r = await sendSignInLink(to);
    setPhase(r.ok ? { s: "sent", to } : { s: "error", message: r.message });
  };
  if (phase.s === "sent") {
    return (
      <div className="space-y-2">
        <p className="text-[13.5px] font-medium">Check your email</p>
        <p className="text-[12.5px] text-muted">
          We sent a sign-in link to <span className="text-fg">{phase.to}</span>. Open it on this device, in this browser, and you will come back here signed in.
        </p>
        <button type="button" onClick={onDone} className="cursor-pointer text-[12.5px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
          Close
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2.5" noValidate>
      <div>
        <p className="text-[13.5px] font-medium">Sign in</p>
        <p className="mt-0.5 text-[12.5px] text-muted">Syncs your portfolio, watchlist and saved work across devices.</p>
      </div>
      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-10 w-full rounded-lg border border-line-strong bg-bg px-3 text-[14px] outline-none focus:border-fg"
          autoFocus
        />
      </label>
      {phase.s === "error" && <p className="text-[12.5px] text-down">{phase.message}</p>}
      <button
        type="submit"
        disabled={phase.s === "sending"}
        className="h-9 w-full cursor-pointer rounded-lg bg-fg text-[13px] font-medium text-bg hover:opacity-90 disabled:cursor-default disabled:opacity-60"
      >
        {phase.s === "sending" ? "Sending..." : "Email me a sign-in link"}
      </button>
    </form>
  );
}

function AccountPanel({ email }: { email: string | null }) {
  const sync = useSyncStatus();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[12px] text-faint">Signed in as</p>
        <p className="truncate text-[13.5px] font-medium">{email ?? "your account"}</p>
      </div>
      <p className={`text-[12.5px] ${sync.state === "error" ? "text-down" : "text-muted"}`} aria-live="polite">
        {syncLine(sync)}
      </p>
      {sync.pendingReload && (
        <button type="button" onClick={applyPendingReload} className="h-9 w-full cursor-pointer rounded-lg bg-fg text-[13px] font-medium text-bg hover:opacity-90">
          Reload to show changes from another device
        </button>
      )}
      <BackupList />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
          setBusy(false);
        }}
        className="h-9 w-full cursor-pointer rounded-lg border border-line-strong text-[13px] font-medium hover:bg-hover disabled:opacity-60"
      >
        Sign out
      </button>
      <p className="text-[11.5px] text-faint">Signing out keeps this device&apos;s copy; it just stops syncing.</p>
    </div>
  );
}

/** Top-bar account button: sign in by emailed link, then shows sync status and sign out. Hidden when sign-in is not set up. */
export function AccountMenu() {
  const auth = useAuth();
  const sync = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [keySignal, setKeySignal] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // "Add your AI key" buttons elsewhere open this menu on the key form.
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setKeySignal((n) => n + 1);
    };
    window.addEventListener(OPEN_AI_KEY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AI_KEY_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.accountOpen = "1";
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      delete document.documentElement.dataset.accountOpen;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (auth.status === "loading") return null;
  const signedIn = auth.status === "signed-in";
  // Without sign-in configured the menu still offers the visitor's own AI key.
  const keyOnly = auth.status === "off";
  const label = keyOnly ? "AI key" : signedIn ? "Account" : "Sign in";
  return (
    <div ref={root} className="relative flex items-center gap-2">
      {signedIn && sync.pendingReload && (
        <button
          type="button"
          onClick={applyPendingReload}
          title="Changes arrived from another device. Reload to show them."
          className="hidden h-10 cursor-pointer items-center rounded-xl border border-line px-2.5 text-[12.5px] font-medium text-fg hover:bg-hover sm:flex"
        >
          Reload
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={keyOnly ? "Your AI key" : signedIn ? "Account and sync" : "Sign in"}
        className={iconBtn}
      >
        <PersonIcon />
        <span className={signedIn ? "sr-only" : "sr-only md:not-sr-only"}>{label}</span>
        {signedIn && <span className={`h-1.5 w-1.5 rounded-full ${sync.pendingReload || sync.state === "error" ? "bg-down" : "bg-up"}`} aria-hidden />}
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="fixed inset-x-4 top-[68px] z-50 rounded-xl border border-line bg-bg p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[320px]">
          <div className="space-y-3">
            {keyOnly ? null : signedIn ? <AccountPanel email={auth.email} /> : <SignInForm onDone={() => setOpen(false)} />}
            <AiKeyForm openSignal={keyOnly ? keySignal + 1 : keySignal} />
          </div>
        </div>
      )}
    </div>
  );
}
