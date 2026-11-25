"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import { MARKET_TABS, displayTicker, quoteHref, shortName } from "@/lib/instruments";
import type { SearchResult } from "@/lib/types";

const DEBOUNCE_MS = 140;
const MAX_LOCAL = 4;

const LOCAL: SearchResult[] = MARKET_TABS.flatMap((t) =>
  t.symbols.map((s) => ({ symbol: s, name: shortName(s), type: t.label, exchange: "" })),
);

function localMatches(q: string): SearchResult[] {
  const needle = q.toLowerCase();
  return LOCAL.filter(
    (r) => r.name.toLowerCase().includes(needle) || displayTicker(r.symbol).toLowerCase().startsWith(needle),
  ).slice(0, MAX_LOCAL);
}

export function CommandSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, loading } = useFetch<{ results: SearchResult[] }>(
    debounced ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );

  const results = useMemo(() => {
    if (!debounced) return [];
    const local = localMatches(debounced);
    const seen = new Set(local.map((r) => r.symbol));
    const remote = (data?.results ?? []).filter((r) => !seen.has(r.symbol));
    return [...local, ...remote].slice(0, 9);
  }, [debounced, data]);

  useEffect(() => setActive(0), [debounced]);

  const go = (symbol: string) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(quoteHref(symbol));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const pick = results[active]?.symbol ?? query.trim().toUpperCase();
      if (/^[A-Za-z0-9.@=\-^_]{1,24}$/.test(pick)) go(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && debounced.length > 0;

  return (
    <div className="relative w-full max-w-[560px]">
      <label className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 transition-colors focus-within:border-line-strong focus-within:bg-card">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-faint" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="sr-only">Search securities</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Search stocks, indices, FX, commodities, crypto"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls="search-results"
        />
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-faint sm:block">/</kbd>
      </label>

      {showList && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        >
          {results.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-muted">{loading ? "Searching…" : "No matches"}</li>
          )}
          {results.map((r, i) => (
            <li key={`${r.symbol}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r.symbol)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-hover" : ""}`}
              >
                <span className="num w-20 shrink-0 text-[13px] font-semibold">{displayTicker(r.symbol)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{r.name}</span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">{r.exchange || r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
