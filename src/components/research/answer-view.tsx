"use client";

import { useId } from "react";
import type { AnalystAnswer } from "@/lib/ai/types";
import type { Provenance } from "@/lib/provenance";
import { fmtAsOf } from "@/lib/format";
import { SourceTags } from "@/components/ui/source-tag";
import { KindChip, KindLegend, RefMarkers, SourcesList } from "./claim-parts";

type Props = { answer: AnalystAnswer; sources: Provenance[]; compact?: boolean };

export const AI_FOOTER = "AI-generated research, not investment advice.";

/** Labelled claims grouped by section, with reference markers into the numbered sources list. */
export function AnswerView({ answer, sources, compact = false }: Props) {
  const uid = useId().replace(/:/g, "");
  const anchor = (id: string) => `src-${uid}-${id}`;
  const headingCls = compact ? "text-[13px]" : "text-[14.5px]";
  return (
    <article className="space-y-5">
      <KindLegend />
      {answer.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.heading && <h3 className={`${headingCls} font-semibold tracking-tight`}>{s.heading}</h3>}
          <ul className="space-y-2">
            {s.claims.map((c, j) => (
              <li key={j} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
                <KindChip kind={c.kind} />
                <p className={`min-w-0 flex-1 leading-relaxed ${compact ? "text-[13px]" : "text-[14px]"} ${c.kind === "interpretation" ? "text-muted" : ""}`}>
                  {c.text}
                  <RefMarkers refs={c.refs} anchor={anchor} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {answer.warnings.length > 0 && (
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[12px] font-semibold text-muted">Notes on this answer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-muted">
            {answer.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Sources</h3>
        <SourcesList citations={answer.citations} anchor={anchor} />
        {sources.length > 0 && (
          <div className="pt-1">
            <p className="text-[11.5px] text-faint">Data supplied to the analyst:</p>
            <SourceTags list={sources} />
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11.5px] text-faint">
        <span>{AI_FOOTER}</span>
        <span>
          {answer.model} · {fmtAsOf(answer.generatedAt)}
          {answer.usedWebSearch ? " · used web search" : ""}
        </span>
      </footer>
    </article>
  );
}
