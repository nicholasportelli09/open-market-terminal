"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import type { SearchResult } from "@/lib/types";

const DEBOUNCE_MS = 160;
const MAX_RESULTS = 8;
export const TICKER_RE = /^[A-Za-z0-9.\-]{1,12}$/;

type TickerPickerProps = {
  /** Called with a validated, upper-case ticker. */
  onPick: (symbol: string) => void;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  /** Only stocks are useful here: SEC filings back the valuation. */
  stocksOnly?: boolean;
  className?: string;
};

/**
 * What Enter opens when no suggestion is highlighted: the typed text when it is a listed symbol (or the suggestions
 * are stale), else the first suggestion when its name matches the text ("apple" -> AAPL), else the typed text.
 */
export function enterTarget(query: string, debounced: string, shown: SearchResult[]): string {
  const text = query.trim();
  const first = shown[0];
  if (!first || debounced !== text) return text;
  if (shown.some((r) => r.symbol.toUpperCase() === text.toUpperCase())) return text;
  return first.name.toLowerCase().includes(text.toLowerCase()) ? first.symbol : text;
}

/** Ticker box with suggestions from /api/search. Enter picks the highlighted suggestion, else see enterTarget. */
export function TickerPicker({
  onPick,
  label = "Company ticker",
  placeholder = "Ticker or company, e.g. AAPL",
  submitLabel = "Open",
  stocksOnly = true,
  className = "",
}: TickerPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  /** Highlighted suggestion; -1 = none, so Enter uses the typed text (suggestions may lag the typing). */
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading, error: searchError } = useFetch<{ results: SearchResult[] }>(
    debounced ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );
  const results = useMemo(
    // SEC filings exist only for US listings, so the stocks-only picker drops exchange-suffixed symbols ("7203.T-JP").
    () => (data?.results ?? []).filter((r) => !stocksOnly || (r.type === "STOCK" && !/-[A-Z]{2,3}$/.test(r.symbol))).slice(0, MAX_RESULTS),
    [data, stocksOnly],
  );
  const shown = debounced ? results : [];

  const pick = (raw: string) => {
    const symbol = raw.trim().toUpperCase();
    if (!TICKER_RE.test(symbol)) {
      setError("Enter a ticker of up to 12 letters, digits, dots or dashes.");
      return;
    }
    setError(null);
    setOpen(false);
    setQuery("");
    onPick(symbol);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(open && active >= 0 && shown[active] ? shown[active].symbol : enterTarget(query, debounced, shown));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && debounced.length > 0;
  return (
    <div className={`relative w-full max-w-[460px] ${className}`}>
      <label className="mb-1 block text-[12.5px] text-muted" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`${listId}-input`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
          aria-invalid={!!error || undefined}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px] outline-none placeholder:text-faint focus:border-line-strong focus:bg-card"
        />
        <button
          type="button"
          onClick={() => pick(query)}
          className="h-10 shrink-0 cursor-pointer rounded-xl border border-fg bg-fg px-4 text-[13.5px] font-medium text-bg hover:opacity-90"
        >
          {submitLabel}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12.5px] text-down">{error}</p>}
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-[72px] z-30 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
          {shown.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-muted">
              {loading ? "Searching…" : searchError ? "Search is unavailable; type a ticker and press Enter." : "No matching stocks"}
            </li>
          )}
          {shown.map((r, i) => (
            <li key={`${r.symbol}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r.symbol)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-hover" : ""}`}
              >
                <span className="num w-16 shrink-0 text-[13px] font-semibold">{r.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{r.name}</span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">{r.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
