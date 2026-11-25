import { fmtAsOf, fmtBp, fmtNumber } from "@/lib/format";
import { lastMove, type Point } from "@/lib/macro/math";
import { sparkPoints, type Reading } from "@/lib/macro/readings";
import { CENTRAL_BANK_NOTES, FED_EFFECTIVE, FED_LOWER, FED_UPPER } from "@/lib/macro/series";
import { fmtPeriodChange } from "@/lib/macro/units";
import { SourceTags } from "@/components/ui/source-tag";
import { CardShell, ChangeRow, FredCard, MissingCard, fmtRange, fredProv } from "./macro-card";
import { MiniLine } from "./mini-line";
import { GRID, GroupGate, Section } from "./section";
import type { GroupState, SeriesSlot } from "./use-macro-data";

function LastMove({ points }: { points: readonly Point[] }) {
  const move = lastMove(points);
  return (
    <p className="mt-1 text-[12px] text-muted">
      {move ? (
        <>
          Last move <span className="num text-fg">{fmtBp(move.diff)}</span> on {fmtAsOf(move.date)}
        </>
      ) : (
        "No change in the window loaded"
      )}
    </p>
  );
}

function FedCard({ upper, lower, effective }: { upper: Reading; lower: Reading; effective: Reading | null }) {
  const sameDay = upper.latest.date === lower.latest.date;
  const sources = [fredProv(upper), fredProv(lower), ...(effective ? [fredProv(effective)] : [])];
  return (
    <CardShell
      title="Federal Reserve: target range"
      detail="The range the Fed sets for overnight lending between banks"
      badge="Daily"
      footer={<SourceTags list={sources} />}
    >
      <p className="num text-[21px] font-medium leading-tight">
        {sameDay ? fmtRange(lower.latest.value, upper.latest.value) : "Bounds dated differently"}
      </p>
      <ChangeRow
        items={[
          { label: "1m", text: fmtPeriodChange("rate", upper.m1), title: upper.m1 ? `Upper bound vs ${upper.m1.from.date}` : undefined },
          { label: "1y", text: fmtPeriodChange("rate", upper.y1), title: upper.y1 ? `Upper bound vs ${upper.y1.from.date}` : undefined },
          ...(effective ? [{ label: "Effective", text: `${fmtNumber(effective.latest.value, 2)}%`, title: `DFF on ${effective.latest.date}` }] : []),
        ]}
      />
      <LastMove points={upper.points} />
      <div className="mt-auto pt-2.5">
        <MiniLine points={sparkPoints(upper, 36)} label="Fed target range upper bound" />
      </div>
    </CardShell>
  );
}

type Props = { state: GroupState; slots: Map<string, SeriesSlot> };

/** Policy rates: Fed range + effective, ECB deposit rate, and the clearly labelled UK / Japan proxies. */
export function CentralBanks({ state, slots }: Props) {
  const r = (id: string) => slots.get(id)?.reading ?? null;
  const upper = r(FED_UPPER);
  const lower = r(FED_LOWER);
  const ecb = r("ECBDFR");
  return (
    <Section
      id="central"
      title="Central banks"
      explainer="Overnight rates central banks set or steer (100 bp = 1 percentage point)."
    >
      <GroupGate state={state} skeletons={4}>
        <div className={GRID}>
          {upper && lower ? (
            <FedCard upper={upper} lower={lower} effective={r(FED_EFFECTIVE)} />
          ) : (
            <MissingCard id={upper ? FED_LOWER : FED_UPPER} error={slots.get(upper ? FED_LOWER : FED_UPPER)?.error ?? null} />
          )}
          {ecb ? (
            <FredCard reading={ecb} sparkMonths={36}>
              <LastMove points={ecb.points} />
            </FredCard>
          ) : (
            <MissingCard id="ECBDFR" error={slots.get("ECBDFR")?.error ?? null} />
          )}
          {["IUDSOIA", "IRSTCI01JPM156N"].map((id) => {
            const reading = r(id);
            return reading ? <FredCard key={id} reading={reading} sparkMonths={36} /> : <MissingCard key={id} id={id} error={slots.get(id)?.error ?? null} />;
          })}
        </div>
        <ul className="mt-2.5 space-y-0.5 text-[12px] text-faint">
          {CENTRAL_BANK_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </GroupGate>
    </Section>
  );
}
