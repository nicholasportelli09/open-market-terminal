import type { ReactNode } from "react";
import { ErrorState, UnavailableState } from "@/components/ui/states";
import { FredCard, MissingCard, SkeletonCard } from "./macro-card";
import type { GroupState, SeriesSlot } from "./use-macro-data";

export const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

type SectionProps = { id: string; title: string; explainer: string; children: ReactNode; action?: ReactNode };

/** A dashboard section: heading, one-line explainer, then its cards. */
export function Section({ id, title, explainer, children, action }: SectionProps) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="scroll-mt-28 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            {title}
          </h2>
          <p className="mt-0.5 max-w-[78ch] text-[13px] text-muted">{explainer}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

type GateProps = { state: GroupState; skeletons: number; children: ReactNode };

/** Loading, not-configured and error states for one FRED request; children once data is there. */
export function GroupGate({ state, skeletons, children }: GateProps) {
  if (state.status === "unavailable" && state.error) {
    return (
      <div className="rounded-2xl border border-line bg-card">
        <UnavailableState message={state.error.message} missingEnv={state.error.missingEnv} />
      </div>
    );
  }
  if (state.status === "error" && state.error) {
    return (
      <div className="rounded-2xl border border-line bg-card">
        <ErrorState message={state.error.message} onRetry={state.reload} />
      </div>
    );
  }
  if (state.data === null) {
    return (
      <div className={GRID}>
        {Array.from({ length: skeletons }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }
  return (
    <>
      {state.stale && state.error && (
        <p className="mb-2 text-[12px] text-faint" role="status">
          Showing the last good load; the latest refresh failed: {state.error.message}
        </p>
      )}
      {children}
    </>
  );
}

/** A FRED card for each id, or a card saying that series is unavailable. */
export function SeriesCards({ ids, slots, sparkMonths }: { ids: readonly string[]; slots: Map<string, SeriesSlot>; sparkMonths?: number }) {
  return (
    <>
      {ids.map((id) => {
        const slot = slots.get(id);
        if (!slot) return <SkeletonCard key={id} />;
        return slot.reading ? (
          <FredCard key={id} reading={slot.reading} sparkMonths={sparkMonths} />
        ) : (
          <MissingCard key={id} id={id} error={slot.error} />
        );
      })}
    </>
  );
}
