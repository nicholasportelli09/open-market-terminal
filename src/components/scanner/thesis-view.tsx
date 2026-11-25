import { SourceTag } from "@/components/ui/source-tag";
import { CLAIM_LABEL, type ClaimKind } from "@/lib/ai/types";
import { fmtAsOf } from "@/lib/format";
import type { ThesisResult } from "@/lib/scanner/thesis";
import { ScenarioTable } from "./scenario-table";

const KIND_CLS: Record<ClaimKind, string> = {
  fact: "border-line text-fg",
  estimate: "border-accent/50 text-accent",
  interpretation: "border-line text-faint italic",
};

function KindChip({ kind }: { kind: ClaimKind }) {
  return (
    <span className={`inline-flex h-[18px] shrink-0 items-center rounded border px-1 text-[10.5px] font-medium uppercase tracking-wide ${KIND_CLS[kind]}`}>
      {CLAIM_LABEL[kind]}
    </span>
  );
}

/** A generated thesis: labelled claims (numbered E1.. for the scenario rationales), citations, scenarios. */
export function ThesisView({ thesis }: { thesis: ThesisResult }) {
  const sections = thesis.answer.sections;
  const starts = sections.map((_, i) => sections.slice(0, i).reduce((sum, x) => sum + x.claims.length, 0));
  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-faint">
        Generated {fmtAsOf(thesis.generatedAt)} by {thesis.model}
        {thesis.answer.usedWebSearch ? " with web search" : ""}. AI text: facts cite a source; estimates and interpretations are not verified.
        General research, not advice.
      </p>
      {sections.map((s, i) => (
        <section key={i}>
          {s.heading && <h4 className="text-[13px] font-semibold">{s.heading}</h4>}
          <ul className="mt-1 space-y-1.5">
            {s.claims.map((c, j) => {
              const n = starts[i] + j + 1;
              return (
                <li key={n} className="flex gap-2 text-[13px] leading-snug">
                  <span className="num w-7 shrink-0 pt-px text-[11px] text-faint">E{n}</span>
                  <KindChip kind={c.kind} />
                  <span className="min-w-0">
                    {c.text}
                    {c.refs.length > 0 && (
                      <span className="ml-1 text-[11.5px] text-faint">
                        {c.refs.map((r) => (
                          <a key={r} href={`#cite-${thesis.symbol}-${r}`} className="num mr-1 underline-offset-2 hover:text-muted hover:underline">[{r}]</a>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {thesis.answer.citations.length > 0 && (
        <section>
          <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Sources</h4>
          <ol className="mt-1 space-y-1">
            {thesis.answer.citations.map((c) => (
              <li key={c.id} id={`cite-${thesis.symbol}-${c.id}`} className="scroll-mt-20 text-[12px] leading-snug">
                <span className="num mr-1.5 text-faint">[{c.id}]</span>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-muted underline-offset-2 hover:text-fg hover:underline">{c.title}</a>
                ) : (
                  <span className="text-muted">{c.title}</span>
                )}
                {c.provenance && <SourceTag provenance={c.provenance} className="ml-1.5" />}
              </li>
            ))}
          </ol>
        </section>
      )}
      <ScenarioTable thesis={thesis} />
      {thesis.warnings.length > 0 && (
        <ul className="space-y-0.5 text-[11.5px] text-faint">
          {thesis.warnings.map((w) => (
            <li key={w}>Note: {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
