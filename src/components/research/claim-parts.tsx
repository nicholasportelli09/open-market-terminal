import type { Citation, ClaimKind } from "@/lib/ai/types";
import { SourceTag } from "@/components/ui/source-tag";

export const KIND_LABEL: Record<ClaimKind, string> = { fact: "Verified fact", estimate: "Estimate", interpretation: "Interpretation" };

const KIND_STYLE: Record<ClaimKind, string> = {
  fact: "border-up/40 text-up",
  estimate: "border-accent/50 text-accent",
  interpretation: "border-line text-muted",
};

export function KindChip({ kind }: { kind: ClaimKind }) {
  return (
    <span className={`inline-flex h-[18px] shrink-0 items-center self-start sm:self-auto whitespace-nowrap rounded border px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] ${KIND_STYLE[kind]}`}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export function KindLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-faint">
      <span className="flex items-center gap-1.5"><KindChip kind="fact" /> backed by a cited source</span>
      <span className="flex items-center gap-1.5"><KindChip kind="estimate" /> forecast or projection</span>
      <span className="flex items-center gap-1.5"><KindChip kind="interpretation" /> the analyst&apos;s reading, not verified</span>
    </p>
  );
}

export function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Reference markers that jump to the sources list. */
export function RefMarkers({ refs, anchor }: { refs: string[]; anchor: (id: string) => string }) {
  if (refs.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-baseline">
      {refs.map((r) => (
        <a key={r} href={`#${anchor(r)}`} className="num rounded bg-hover px-1 text-[10.5px] font-semibold text-muted no-underline hover:bg-line hover:text-fg" aria-label={`Source ${r}`}>
          {r}
        </a>
      ))}
    </span>
  );
}

/** Numbered list of every source the answer cites: supplied data with SourceTag, web pages with title + domain. */
export function SourcesList({ citations, anchor }: { citations: Citation[]; anchor: (id: string) => string }) {
  if (citations.length === 0) return <p className="text-[12.5px] text-faint">The answer cites no sources.</p>;
  return (
    <ol className="space-y-2">
      {citations.map((c) => (
        <li key={c.id} id={anchor(c.id)} className="flex scroll-mt-24 gap-2.5 text-[12.5px]">
          <span className="num mt-px w-7 shrink-0 text-[11px] font-semibold text-faint">{c.id}</span>
          <div className="min-w-0 flex-1">
            {c.kind === "web" && c.url ? (
              <>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug break-words hover:underline">{c.title}</a>
                <span className="block text-[11.5px] text-faint">Web · {hostOf(c.url)}</span>
              </>
            ) : (
              <>
                <span className="block font-medium leading-snug break-words">{c.title}</span>
                {c.provenance ? <SourceTag provenance={c.provenance} /> : <span className="text-[11.5px] text-faint">Supplied data</span>}
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
