"use client";

import { useEffect, useId, useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import type { SearchResult } from "@/lib/types";
import { inputCls } from "./ui-bits";

const DEBOUNCE_MS = 180;
const MAX_RESULTS = 8;

type Props = {
  id: string;
  value: string;
  onChange: (symbol: string) => void;
  /** A suggestion was picked: symbol, name and CNBC type. */
  onPick: (result: SearchResult) => void;
  ariaProps: Record<string, unknown>;
};

/** Symbol input with /api/search suggestions (combobox: arrows, Enter to pick, Escape to close). */
export function SymbolField({ id, value, onChange, onPick, ariaProps }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  const query = open && debounced.length > 0 && debounced.length <= 40 ? debounced : null;
  const { data, loading, error } = useFetch<{ results: SearchResult[] }>(query ? `/api/search?q=${encodeURIComponent(query)}` : null);
  const results = query ? (data?.results ?? []).slice(0, MAX_RESULTS) : [];
  const showList = open && query !== null && (results.length > 0 || loading || !!error);

  const pick = (r: SearchResult) => {
    onPick(r);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        {...ariaProps}
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder="e.g. AAPL"
        className={`${inputCls} uppercase placeholder:normal-case`}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-lg">
          {results.length === 0 && (
            <li className="px-3 py-2 text-[12.5px] text-faint" role="presentation">
              {loading ? "Searching..." : "Search is unavailable; type the symbol."}
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.symbol}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-[13px] ${i === active ? "bg-hover" : ""}`}
            >
              <span className="font-semibold">{r.symbol}</span>
              <span className="min-w-0 truncate text-muted">{r.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-faint">{[r.type, r.exchange].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
