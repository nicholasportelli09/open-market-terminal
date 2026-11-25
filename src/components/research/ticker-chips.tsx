"use client";

import { useEffect, useId, useState } from "react";
import { displayTicker } from "@/lib/instruments";
import type { SearchResult } from "@/lib/types";

const DEBOUNCE_MS = 200;
const MAX_SUGGESTIONS = 6;
const QUERY_RE = /^[\p{L}\p{N} .&@=\-^']{1,40}$/u;

/** Search via /api/search. Returns [] for empty input; throws on network / server failure. */
export async function searchTickers(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query || !QUERY_RE.test(query)) return [];
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const json = (await res.json()) as { results?: SearchResult[] };
  return Array.isArray(json.results) ? json.results : [];
}

/** The search result whose symbol exactly matches `q` (case-insensitive), if any. */
export function exactMatch(results: readonly SearchResult[], q: string): SearchResult | undefined {
  const up = q.trim().toUpperCase();
  return results.find((r) => r.symbol.toUpperCase() === up || displayTicker(r.symbol).toUpperCase() === up);
}

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  label: string;
  /** Disables adding (e.g. a mode that takes no tickers). */
  disabled?: boolean;
};

/** Ticker chips; each ticker is checked against the symbol search before it is added. */
export function TickerChips({ value, onChange, max, label, disabled = false }: Props) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const full = value.length >= max;

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const c = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      searchTickers(q, c.signal)
        .then((r) => setResults(r.slice(0, MAX_SUGGESTIONS)))
        .catch(() => !c.signal.aborted && setMessage("Symbol search is unavailable right now."))
        .finally(() => !c.signal.aborted && setSearching(false));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [text]);

  const add = (symbol: string) => {
    setMessage(null);
    const up = symbol.toUpperCase();
    if (value.includes(up)) return setText("");
    if (full) return setMessage(`This mode takes at most ${max} ticker${max === 1 ? "" : "s"}.`);
    onChange([...value, up]);
    setText("");
    setResults([]);
  };

  const onEnter = async () => {
    const q = text.trim();
    if (!q) return;
    const hit = exactMatch(results, q);
    if (hit) return add(hit.symbol);
    try {
      setSearching(true);
      const fresh = await searchTickers(q);
      const exact = exactMatch(fresh, q);
      if (exact) return add(exact.symbol);
      setResults(fresh.slice(0, MAX_SUGGESTIONS));
      setMessage(fresh.length ? `"${q}" is not an exact ticker. Pick one of the matches.` : `No instrument found for "${q}".`);
    } catch {
      setMessage("Symbol search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-[12.5px] font-medium text-muted">{label}</label>
      <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card px-2 py-1.5 ${disabled ? "opacity-60" : ""}`}>
        {value.map((s) => (
          <span key={s} className="inline-flex h-7 items-center gap-1 rounded-lg bg-hover pl-2 pr-1 text-[12.5px] font-semibold">
            <span className="num">{displayTicker(s)}</span>
            <button type="button" onClick={() => onChange(value.filter((v) => v !== s))} aria-label={`Remove ${s}`} className="grid h-5 w-5 cursor-pointer place-items-center rounded text-muted hover:bg-line hover:text-fg">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={text}
          disabled={disabled || full}
          onChange={(e) => { setText(e.target.value); setMessage(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void onEnter(); }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          placeholder={disabled ? "Not used in this mode" : full ? "Maximum reached" : "Type a ticker or name, then Enter"}
          aria-describedby={message ? `${inputId}-msg` : undefined}
          aria-controls={results.length ? listId : undefined}
          autoComplete="off"
          className="h-7 min-w-[9rem] flex-1 bg-transparent px-1 text-[13.5px] outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
        {searching && <span className="text-[11.5px] text-faint" role="status">Searching</span>}
      </div>
      {results.length > 0 && text.trim() && (
        <ul id={listId} aria-label="Matching instruments" className="mt-1.5 overflow-hidden rounded-xl border border-line bg-card">
          {results.map((r) => (
            <li key={r.symbol} className="border-b border-line last:border-0">
              <button type="button" onClick={() => add(r.symbol)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-hover">
                <span className="num w-16 shrink-0 truncate text-[12.5px] font-semibold">{displayTicker(r.symbol)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{r.name}</span>
                <span className="hidden shrink-0 text-[11.5px] text-faint sm:block">{r.exchange || r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p id={`${inputId}-msg`} className="mt-1.5 text-[12px] text-down">{message}</p>}
    </div>
  );
}
