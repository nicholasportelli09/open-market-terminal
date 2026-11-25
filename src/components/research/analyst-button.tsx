"use client";

import { analystDrawer, useAnalystDrawerOpen } from "./drawer-store";

/** Top-bar button that opens the global Analyst drawer. Icon only on phones. */
export function AnalystButton() {
  const open = useAnalystDrawerOpen();
  return (
    <button
      type="button"
      onClick={() => analystDrawer.open()}
      aria-haspopup="dialog"
      aria-expanded={open}
      title="AI analyst"
      className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
        <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
      </svg>
      <span className="sr-only md:not-sr-only xl:sr-only 2xl:not-sr-only">Analyst</span>
    </button>
  );
}
