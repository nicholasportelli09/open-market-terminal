import type { ReactNode } from "react";
import { SESSION_LABEL, SOURCES, type PriceSession, type Provenance, type SourceId } from "@/lib/provenance";
import { fmtAsOf } from "@/lib/format";

/** Short display names; the full name stays in the tooltip. */
const SHORT: Partial<Record<SourceId, string>> = {
  cnbc: "CNBC",
  naver: "Naver",
  sec: "SEC EDGAR",
  fred: "FRED",
  nasdaq: "Nasdaq",
  fmp: "FMP",
  "google-news": "Google News",
  anthropic: "Claude",
  gemini: "Gemini",
  user: "Your input",
  model: "Model",
};

function parts(p: Provenance): string[] {
  const out = [SHORT[p.source] ?? SOURCES[p.source]?.name ?? p.source];
  if (p.asOf) out.push(`as of ${fmtAsOf(p.asOf)}`);
  if (p.session && SESSION_LABEL[p.session]) out.push(SESSION_LABEL[p.session]);
  if (p.delayed) out.push("Delayed");
  if (p.note) out.push(p.note);
  return out;
}

type SourceTagProps = { provenance: Provenance; className?: string };

/** Faint one-line attribution: "SEC EDGAR · as of Sep 27, 2026 · TTM", linked to the record or source. */
export function SourceTag({ provenance, className = "" }: SourceTagProps) {
  const info = SOURCES[provenance.source];
  const href = provenance.url || info?.url || "";
  const title = info ? `${info.name}. ${info.terms}` : undefined;
  const text = parts(provenance).join(" · ");
  const cls = `text-[11.5px] leading-snug text-faint ${className}`;
  if (!href) {
    return <span className={cls} title={title}>{text}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={`${cls} underline-offset-2 hover:text-muted hover:underline`}>
      {text}
    </a>
  );
}

/** Several sources, de-duplicated by source + as-of, separated by a thin divider. */
export function SourceTags({ list, className = "" }: { list: Provenance[]; className?: string }) {
  const seen = new Set<string>();
  const unique = list.filter((p) => {
    const key = `${p.source}|${p.asOf}|${p.session ?? ""}|${p.url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return null;
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}>
      {unique.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="h-3 w-px bg-line" aria-hidden />}
          <SourceTag provenance={p} />
        </span>
      ))}
    </span>
  );
}

const COMPACT: Record<PriceSession, string> = {
  regular: "",
  continuous: "",
  pre: "Pre-market",
  post: "After hours",
  closed: "Closed",
  "n/a": "",
};

const LIVE: Partial<Record<PriceSession, string>> = { regular: "Market open", continuous: "24h market" };

type SessionMarkProps = { session: PriceSession; delayed?: boolean; showLive?: boolean; className?: string };

/**
 * Tiny market-phase marker for dense rows: "Closed" / "Pre-market" / "After hours", plus "Delayed".
 * While the market trades live it shows nothing, or "Market open" / "24h market" with showLive.
 */
export function SessionMark({ session, delayed, showLive = false, className = "" }: SessionMarkProps) {
  const phase = COMPACT[session] || (showLive ? LIVE[session] ?? "" : "");
  const label = [phase, delayed ? "Delayed" : ""].filter(Boolean).join(" · ");
  if (!label) return null;
  return <span className={`whitespace-nowrap text-[11px] text-faint ${className}`}>{label}</span>;
}

/** Small chip, e.g. "Delayed". */
export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex h-5 items-center rounded-md border border-line px-1.5 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}
