import type { ReactNode } from "react";
import type { AnalystData, AnalystIssue, AnalystSection, RatingKey } from "@/lib/analyst-types";
import type { Provenance } from "@/lib/provenance";
import { SourceTags } from "@/components/ui/source-tag";
import { EmptyState, UnavailableState } from "@/components/ui/states";

/** Tailwind background per rating bucket (bullish green to bearish red). */
export const RATING_BG: Record<RatingKey, string> = {
  strongBuy: "bg-up",
  buy: "bg-up/55",
  hold: "bg-faint/55",
  sell: "bg-down/55",
  strongSell: "bg-down",
};

export function ratingTone(key: RatingKey | null): string {
  if (key === "strongBuy" || key === "buy") return "text-up";
  if (key === "sell" || key === "strongSell") return "text-down";
  return "text-muted";
}

export function issuesFor(data: AnalystData, section: AnalystSection): AnalystIssue[] {
  return data.issues.filter((i) => i.section === section);
}

/** Faint notes for partial problems inside a section that still shows data. */
export function IssueNotes({ issues, className = "" }: { issues: AnalystIssue[]; className?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className={`space-y-0.5 text-[12px] text-muted ${className}`}>
      {issues.map((i, n) => (
        <li key={n}>{i.message}</li>
      ))}
    </ul>
  );
}

type MissingProps = { data: AnalystData; section: AnalystSection; emptyTitle: string; emptyBody?: ReactNode };

/** Why a section has no data: not configured, a provider problem, or simply no coverage. */
export function MissingSection({ data, section, emptyTitle, emptyBody }: MissingProps) {
  const issues = issuesFor(data, section);
  const notConfigured = issues.find((i) => i.kind === "not_configured");
  if (notConfigured) return <UnavailableState message={notConfigured.message} missingEnv={notConfigured.env ? [notConfigured.env] : undefined} />;
  if (issues.length > 0) {
    return <EmptyState title="Unavailable" body={issues.map((i) => i.message).join(" ")} />;
  }
  return <EmptyState title={emptyTitle} body={emptyBody} />;
}

/** Small section heading inside a panel. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">{children}</div>;
}

/** Source + as-of line at the bottom of a panel. */
export function SourcesFooter({ list, children }: { list: Provenance[]; children?: ReactNode }) {
  if (list.length === 0 && !children) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <SourceTags list={list} />
      {children}
    </div>
  );
}
