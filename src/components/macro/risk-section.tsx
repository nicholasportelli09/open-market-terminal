import type { ReactNode } from "react";
import { LIVE } from "@/lib/macro/series";
import type { Quote } from "@/lib/types";
import { FredCard, MissingCard, SkeletonCard } from "./macro-card";
import { LiveCard } from "./live-card";
import { GRID, Section } from "./section";
import type { GroupState, History, SeriesSlot } from "./use-macro-data";

type Props = {
  state: GroupState;
  slots: Map<string, SeriesSlot>;
  quotes: Record<string, Quote | undefined>;
  histories: Record<string, History>;
  now: Date;
  feedError: boolean;
};

/** Order of cards: each live instrument next to its FRED history where there is one. */
const ORDER: { live?: string; fred?: string }[] = [
  { live: ".VIX" },
  { fred: "VIXCLS" },
  { live: ".DXY" },
  { fred: "DTWEXBGS" },
  { live: "EUR=" },
  { live: "JPY=" },
  { live: "@CL.1" },
  { live: "@GC.1" },
  { live: "@HG.1" },
];

function fredCard(id: string, state: GroupState, slots: Map<string, SeriesSlot>): ReactNode {
  const slot = slots.get(id);
  if (slot?.reading) return <FredCard key={id} reading={slot.reading} />;
  if (slot) return <MissingCard key={id} id={id} error={slot.error} />;
  if (state.error && state.data === null) return <MissingCard key={id} id={id} error={state.error.message} />;
  return <SkeletonCard key={id} />;
}

/** Volatility, the dollar, FX and commodities: live CNBC prices with sessions, plus FRED history. */
export function RiskSection({ state, slots, quotes, histories, now, feedError }: Props) {
  return (
    <Section
      id="risk"
      title="Market risk and cross-asset"
      explainer="Market nerves (VIX), the dollar, currencies and commodities."
    >
      <div className={GRID}>
        {ORDER.map((o) => {
          if (o.fred) return fredCard(o.fred, state, slots);
          const def = LIVE.find((l) => l.symbol === o.live);
          if (!def) return null;
          return <LiveCard key={def.symbol} def={def} quote={quotes[def.symbol]} history={histories[def.symbol]} now={now} feedError={feedError} />;
        })}
      </div>
      {state.status === "error" && state.error && (
        <p className="mt-2 text-[12px] text-faint">
          FRED history failed to load: {state.error.message}{" "}
          <button type="button" onClick={state.reload} className="cursor-pointer text-muted underline underline-offset-2 hover:text-fg">
            Try again
          </button>
        </p>
      )}
    </Section>
  );
}
