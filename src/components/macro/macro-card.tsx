import type { ReactNode } from "react";
import type { Provenance } from "@/lib/provenance";
import { fmtNumber, fmtSigned } from "@/lib/format";
import { monthLabel, sparkPoints, type Reading } from "@/lib/macro/readings";
import { SERIES } from "@/lib/macro/series";
import { fmtLevel, fmtPeriodChange } from "@/lib/macro/units";
import { Chip, SourceTag } from "@/components/ui/source-tag";
import { MiniLine } from "./mini-line";

type ShellProps = { title: ReactNode; detail: string; badge?: string; children: ReactNode; footer?: ReactNode };

/** Card frame shared by FRED and live cards: label, one-line detail, body, source line at the bottom. */
export function CardShell({ title, detail, badge, children, footer }: ShellProps) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[13.5px] font-semibold leading-snug">{title}</h3>
        {badge && <Chip>{badge}</Chip>}
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-muted">{detail}</p>
      <div className="mt-2 flex flex-1 flex-col">{children}</div>
      {footer && <div className="mt-2.5 border-t border-line pt-2">{footer}</div>}
    </article>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-line bg-card p-3.5" role="status" aria-label="Loading">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-2 h-3 w-44" />
      <div className="skeleton mt-3 h-6 w-24" />
      <div className="skeleton mt-3 h-10 w-full" />
    </div>
  );
}

/** A single series FRED did not return: says so instead of showing a number. */
export function MissingCard({ id, error }: { id: string; error: string | null }) {
  const def = SERIES[id];
  return (
    <CardShell title={def?.label ?? id} detail={def?.detail ?? ""} badge={def?.frequency}>
      <p className="text-[13px] text-muted">Unavailable from FRED right now.</p>
      {error && <p className="mt-1 text-[12px] text-faint">{error}</p>}
      <a href={`https://fred.stlouisfed.org/series/${id}`} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11.5px] text-faint underline-offset-2 hover:text-muted hover:underline">
        FRED series {id}
      </a>
    </CardShell>
  );
}

/**
 * FRED provenance for a card. FRED dates monthly observations on the 1st, so for monthly data the
 * as-of is shown as the month ("as of Oct 2026") instead of a misleading "Oct 1, 2026".
 */
export function fredProv(r: Reading, extra?: string): Provenance {
  const monthly = r.def.frequency === "Monthly";
  const note = [monthly ? `as of ${monthLabel(r.latest.date)}` : "", r.def.id, r.def.frequency.toLowerCase(), extra].filter(Boolean).join(" · ");
  return { source: "fred", asOf: monthly ? "" : r.latest.date, session: "n/a", url: r.url, note };
}

type ChangeItem = { label: string; text: string; title?: string };

export function ChangeRow({ items }: { items: ChangeItem[] }) {
  return (
    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
      {items.map((c) => (
        <div key={c.label} className="flex items-baseline gap-1.5" title={c.title}>
          <dt className="text-faint">{c.label}</dt>
          <dd className="num text-fg">{c.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function changeItems(r: Reading): ChangeItem[] {
  const { kind, decimals } = r.def;
  if (kind === "flow" && r.flow) {
    return [
      { label: "Prior month", text: r.flow.prior ? fmtLevel("flow", r.flow.prior.value) : "—", title: r.flow.prior ? monthLabel(r.flow.prior.date) : undefined },
      { label: "3-mo avg", text: r.flow.avg3 !== null ? `${fmtSigned(r.flow.avg3, 0)}k` : "—" },
      {
        label: "12 mo",
        text: r.flow.total12 ? `${fmtSigned(r.flow.total12.diff, 0)}k` : "—",
        title: r.flow.total12 ? `Jobs added since ${monthLabel(r.flow.total12.from.date)}` : "No observation 12 months earlier",
      },
    ];
  }
  return [
    { label: "1m", text: fmtPeriodChange(kind, r.m1, decimals), title: r.m1 ? `vs ${r.m1.from.date}` : "No comparable observation" },
    { label: "1y", text: fmtPeriodChange(kind, r.y1, decimals), title: r.y1 ? `vs ${r.y1.from.date}` : "No comparable observation" },
  ];
}

function referenceText(r: Reading): string | undefined {
  if (r.def.kind === "yoy") return `${monthLabel(r.latest.date)} vs ${monthLabel(`${Number(r.latest.date.slice(0, 4)) - 1}${r.latest.date.slice(4)}`)}`;
  if (r.def.kind === "flow" || r.def.frequency === "Monthly") return monthLabel(r.latest.date);
  return undefined;
}

type FredCardProps = {
  reading: Reading;
  title?: string;
  detail?: string;
  zeroLine?: boolean;
  /** Sparkline window in months (default: 12, or 24 for monthly data). */
  sparkMonths?: number;
  children?: ReactNode;
};

/** Latest value, 1m / 1y change in the right unit, a sparkline and the FRED source line. */
export function FredCard({ reading: r, title, detail, zeroLine, sparkMonths, children }: FredCardProps) {
  const ref = referenceText(r);
  const spark = sparkPoints(r, sparkMonths);
  const footer = <SourceTag provenance={fredProv(r, r.def.kind === "yoy" ? "YoY from index levels" : undefined)} />;
  return (
    <CardShell title={title ?? r.def.label} detail={detail ?? r.def.detail} badge={r.def.frequency} footer={footer}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="num text-[21px] font-medium leading-tight">{fmtLevel(r.def.kind, r.latest.value, r.def.decimals, r.def.signed ?? false)}</span>
        {ref && <span className="text-[12px] text-muted">{ref}</span>}
      </p>
      <ChangeRow items={changeItems(r)} />
      {children}
      <div className="mt-auto pt-2.5">
        <MiniLine points={spark} zeroLine={zeroLine ?? (r.def.kind === "spread" || r.def.kind === "points" || r.def.kind === "flow")} label={r.def.label} />
      </div>
      {r.note && <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{r.note}</p>}
    </CardShell>
  );
}

/** "3.75-4.00%" for a target range. */
export function fmtRange(lo: number, hi: number): string {
  return `${fmtNumber(lo, 2)}–${fmtNumber(hi, 2)}%`;
}
