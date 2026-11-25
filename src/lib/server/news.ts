import type { NewsItem } from "@/lib/types";
import { cached } from "./cache";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const NEWS_TTL_MS = 120_000;
const CNBC_FEEDS = [
  "https://www.cnbc.com/id/100003114/device/rss/rss.html", // top news
  "https://www.cnbc.com/id/15839069/device/rss/rss.html", // markets
  "https://www.cnbc.com/id/20910258/device/rss/rss.html", // economy
];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(item: string, name: string): string {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}

function parseRss(xml: string, fallbackSource: string): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.flatMap((item) => {
    let title = tag(item, "title");
    const link = tag(item, "link");
    if (!title || !/^https?:\/\//.test(link)) return [];
    let source = tag(item, "source") || fallbackSource;
    const suffix = ` - ${source}`;
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    const date = new Date(tag(item, "pubDate"));
    const published = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    source = source.slice(0, 60);
    return [{ title, link, source, published }];
  });
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`News upstream ${res.status}`);
  return parseRss(await res.text(), source);
}

function dedupeSorted(items: NewsItem[], limit: number): NewsItem[] {
  const seen = new Set<string>();
  return items
    .sort((a, b) => b.published.localeCompare(a.published))
    .filter((n) => {
      const key = n.title.toLowerCase().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export async function marketNews(): Promise<NewsItem[]> {
  return cached("news:market", NEWS_TTL_MS, async () => {
    const settled = await Promise.allSettled(CNBC_FEEDS.map((u) => fetchFeed(u, "CNBC")));
    const items = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (items.length === 0) throw new Error("No news available");
    return dedupeSorted(items, 30);
  });
}

export async function symbolNews(query: string): Promise<NewsItem[]> {
  return cached(`news:${query.toLowerCase()}`, NEWS_TTL_MS, async () => {
    const params = new URLSearchParams({ q: `${query} when:7d`, hl: "en-US", gl: "US", ceid: "US:en" });
    const items = await fetchFeed(`https://news.google.com/rss/search?${params}`, "Google News");
    return dedupeSorted(items, 15);
  });
}
