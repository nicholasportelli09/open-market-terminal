"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { analystDrawer, symbolFromPath, useAnalystDrawerOpen } from "./drawer-store";
import { ResearchForm } from "./research-form";
import { ResearchResult } from "./research-result";
import { useResearch } from "./use-research";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Right-side Analyst drawer, full-screen sheet on phones. Mounted once in the root layout; keeps its state while closed. */
export function AnalystDrawer() {
  const open = useAnalystDrawerOpen();
  const pathname = usePathname() ?? "/";
  const symbol = symbolFromPath(pathname);
  const initialSymbols = useMemo(() => (symbol ? [symbol] : []), [symbol]);
  const { state, run, cancel } = useResearch();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const lastRequest = state.status === "error" || state.status === "unavailable" || state.status === "loading" ? state.request : null;

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    el?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        analystDrawer.close();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus();
    };
  }, [open]);

  // Navigating to another page closes the drawer.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname;
      analystDrawer.close();
    }
  }, [pathname]);

  return (
    <div hidden={!open} className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={() => analystDrawer.close()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="analyst-drawer-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-bg shadow-2xl sm:w-[480px] sm:max-w-[92vw]"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <div className="min-w-0">
            <h2 id="analyst-drawer-title" className="text-[15px] font-semibold tracking-tight">Analyst</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/research" onClick={() => analystDrawer.close()} className="hidden h-8 items-center rounded-lg px-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg sm:inline-flex">
              Open Research page
            </Link>
            <button type="button" data-autofocus onClick={() => analystDrawer.close()} aria-label="Close analyst" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-line text-muted hover:bg-hover hover:text-fg">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
          <ResearchForm compact active={open} initialSymbols={initialSymbols} busy={state.status === "loading"} onSubmit={run} />
          <div className="border-t border-line pt-4">
            <ResearchResult compact state={state} onCancel={cancel} onRetry={() => lastRequest && run(lastRequest)} />
          </div>
          <Link href="/research" onClick={() => analystDrawer.close()} className="block text-center text-[12.5px] font-medium text-muted hover:text-fg sm:hidden">
            Open the Research page for history
          </Link>
        </div>
      </div>
    </div>
  );
}
