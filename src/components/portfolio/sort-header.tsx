"use client";

import { useState } from "react";
import type { SortDir } from "./money";

export type Sort<K extends string> = { key: K; dir: SortDir };

/** Sort state: clicking the active column flips direction; a new column starts descending (numbers) or ascending (text). */
export function useSort<K extends string>(initial: Sort<K>, textKeys: readonly K[] = []) {
  const [sort, setSort] = useState<Sort<K>>(initial);
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: textKeys.includes(key) ? "asc" : "desc" }));
  return { sort, toggle };
}

type Props<K extends string> = { label: string; k: K; sort: Sort<K>; onSort: (k: K) => void; align?: "left" | "right"; title?: string };

/** Column header button with aria-sort; the arrow shows the active direction. */
export function SortHeader<K extends string>({ label, k, sort, onSort, align = "right", title }: Props<K>) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        title={title}
        onClick={() => onSort(k)}
        className={`inline-flex cursor-pointer items-center gap-1 rounded uppercase tracking-[0.05em] transition-colors hover:text-fg ${active ? "text-fg" : ""}`}
      >
        {label}
        <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-0"}`}>
          {active && sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
