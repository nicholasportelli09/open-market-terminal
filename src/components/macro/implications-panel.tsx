import { fmtAsOf } from "@/lib/format";
import type { Implication, Tone } from "@/lib/macro/implications";
import { monthLabel } from "@/lib/macro/readings";
import { Panel } from "@/components/ui/panel";
import { Chip } from "@/components/ui/source-tag";
import { EmptyState, LoadingBlock } from "@/components/ui/states";

const TONE: Record<Tone, string> = {
  headwind: "Historically a headwind",
  supportive: "Historically supportive",
  neutral: "Historically neutral",
};

type Props = { items: Implication[]; loading: boolean };

/** Deterministic rule notes ("Interpretation"), each with its reading, threshold and as-of date. */
export function ImplicationsPanel({ items, loading }: Props) {
  return (
    <Panel
      title="What this usually means for equities"
      action={<Chip title="Fixed rules on the readings below: historical patterns, not forecasts or advice. Hover a card for its rule.">Interpretation</Chip>}
    >
      {items.length === 0 ? (
        loading ? (
          <LoadingBlock rows={4} />
        ) : (
          <EmptyState title="No readings to interpret" body="None of the series these rules use could be loaded. Each section below shows why." />
        )
      ) : (
        <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <li key={i.id} title={`Rule: ${i.threshold}`} className="flex min-w-0 flex-col rounded-xl border border-line px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13.5px] font-semibold">{i.topic}</h3>
                <span className="text-[11px] font-medium text-faint">{TONE[i.tone]}</span>
              </div>
              <p className="num mt-0.5 text-[13px]">{i.reading}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">{i.note}</p>
              <p className="mt-auto pt-2 text-[11.5px] text-faint">
                <span className="sr-only">Rule: {i.threshold}. </span>As of {i.id === "inflation" ? monthLabel(i.asOf) : fmtAsOf(i.asOf)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
