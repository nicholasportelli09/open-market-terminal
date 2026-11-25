"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import { timeAgo } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import { ErrorNote, Panel } from "@/components/ui/panel";

const NEWS_REFRESH_MS = 120_000;

type NewsListProps = { query?: string; title?: string; limit?: number; className?: string };

export function NewsList({ query, title = "Headlines", limit = 10, className = "" }: NewsListProps) {
  const url = query ? `/api/news?q=${encodeURIComponent(query)}` : "/api/news";
  const { data, error, loading } = useFetch<{ items: NewsItem[] }>(url, NEWS_REFRESH_MS);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const items = data?.items.slice(0, limit) ?? [];
  return (
    <Panel title={title} className={className}>
      {loading && !data && (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-10" />)}
        </div>
      )}
      {error && !data && <ErrorNote message="News is unavailable right now." />}
      {data && items.length === 0 && <ErrorNote message="No recent stories." />}
      <ul>
        {items.map((n) => (
          <li key={n.link} className="border-b border-line last:border-0">
            <a href={n.link} target="_blank" rel="noopener noreferrer" className="group block px-4 py-3 transition-colors hover:bg-hover">
              <p className="text-[14px] font-medium leading-snug group-hover:underline">{n.title}</p>
              <p className="mt-1 text-[12px] text-faint">
                {n.source}
                {now > 0 && <> · {timeAgo(n.published, now)}</>}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
