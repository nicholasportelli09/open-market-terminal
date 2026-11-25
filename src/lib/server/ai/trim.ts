/** Hard length cap on an analyst answer, applied after parsing so an over-long reply is cut, not shown. Pure. */
import type { AnalystAnswer } from "@/lib/ai/types";

export type LineLimits = {
  /** Claim lines across all sections (headings not counted). */
  maxLines: number;
  /** Claim lines per section; default 3. */
  perSection?: number;
  /** Sections kept, in order; default 4. */
  maxSections?: number;
};

const DEFAULT_PER_SECTION = 3;
const DEFAULT_MAX_SECTIONS = 4;

/** The instruction sent with the question, matching what trimAnswer enforces. */
export function limitsInstruction(l: LineLimits): string {
  const per = l.perSection ?? DEFAULT_PER_SECTION;
  return `Length limit: at most ${l.maxLines} lines in total (headings not counted), at most ${per} per section, each under 25 words.`;
}

/**
 * Keeps the first `perSection` lines of each of the first `maxSections` sections, then, while over `maxLines`,
 * drops the last line of the longest section (so every section keeps its lead line). Citations no claim
 * refers to any more are dropped.
 */
export function trimAnswer(answer: AnalystAnswer, l: LineLimits): AnalystAnswer {
  const per = Math.max(1, l.perSection ?? DEFAULT_PER_SECTION);
  const sections = answer.sections
    .filter((s) => s.claims.length > 0)
    .slice(0, Math.max(1, l.maxSections ?? DEFAULT_MAX_SECTIONS))
    .map((s) => ({ ...s, claims: s.claims.slice(0, per) }));
  let total = sections.reduce((n, s) => n + s.claims.length, 0);
  while (total > Math.max(1, l.maxLines)) {
    let longest = 0;
    sections.forEach((s, i) => {
      if (s.claims.length > sections[longest].claims.length) longest = i;
    });
    if (sections[longest].claims.length <= 1) break;
    sections[longest] = { ...sections[longest], claims: sections[longest].claims.slice(0, -1) };
    total -= 1;
  }
  const used = new Set(sections.flatMap((s) => s.claims.flatMap((c) => c.refs)));
  return { ...answer, sections, citations: answer.citations.filter((c) => used.has(c.id)) };
}
