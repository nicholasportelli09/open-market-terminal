/**
 * Pure parser: turns the analyst's final content blocks into labelled claims with citations.
 * No network, no SDK runtime (type imports only), so it is unit-testable with fixtures.
 */
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AnalystAnswer, AnalystSection, Citation, Claim, ClaimKind } from "@/lib/ai/types";
import type { Provenance } from "@/lib/provenance";

/** One block of OUR sourced data handed to the model. `id` is "S1", "S2", ... */
export type ContextDoc = {
  id: string;
  title: string;
  provenance?: Provenance;
  /** Compact JSON or text of the sourced data. */
  content: string;
};

export type ParsedAnalyst = Pick<AnalystAnswer, "sections" | "citations" | "usedWebSearch" | "warnings">;

const TAG_KIND: Record<string, ClaimKind> = { FACT: "fact", EST: "estimate", VIEW: "interpretation" };
const TAG_RE = /^\[(FACT|EST|VIEW)\]\s*/i;
const MARKER_RE = /\[((?:[SW]\d+)(?:\s*[,;]\s*[SW]\d+)*)\]/gi;
const LIST_PREFIX_RE = /^(?:[-*•]\s+|\d+[.)]\s+)/;
const SCORE_RE = /\b(confidence|probability|likelihood|chance)\b[^.\n]{0,40}?\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%\s*(confidence|probability|likelihood|chance)\b/i;
const FIGURE_RE = /[$€£]\s?\d|\d(?:\.\d+)?\s?%|\d+\.\d+|\d{1,3}(?:,\d{3})+/;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const YEAR_RE = /^(?:19|20)\d{2}$/;
/** Shortest figure signature that may match by prefix (so "391" matches 391035000000, but "6" needs an exact match). */
const MIN_PREFIX_SIG = 3;

const SEARCH_ERROR_TEXT: Record<string, string> = {
  max_uses_exceeded: "the search limit for this answer was reached",
  too_many_requests: "the search service was busy",
  unavailable: "the search service was unavailable",
  query_too_long: "a search query was too long",
  invalid_tool_input: "a search query was invalid",
  request_too_large: "a search request was too large",
};

type Span = { start: number; end: number; ids: string[]; cited: string[] };

type WebState = {
  byUrl: Map<string, Citation>;
  resultTitles: Map<string, string>;
};

function webIdFor(state: WebState, url: string, title: string | null, citedText: string): string {
  const existing = state.byUrl.get(url);
  if (existing) return existing.id;
  const id = `W${state.byUrl.size + 1}`;
  const resolvedTitle = title || state.resultTitles.get(url) || hostOf(url);
  state.byUrl.set(url, { id, kind: "web", title: resolvedTitle, url, citedText: citedText || undefined });
  return id;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Collect search-result titles first so citations can fall back to them. */
function collectResultTitles(content: readonly BetaContentBlock[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const r of block.content) if (r.title) titles.set(r.url, r.title);
  }
  return titles;
}

/** `preambleEnd`: text before the first search when it has no tags or headings ("I'll look that up."). */
type Walk = { text: string; spans: Span[]; usedWebSearch: boolean; warnings: string[]; preambleEnd: number };

/** True when the text already holds answer structure (a heading or a tagged line). */
function hasStructure(text: string): boolean {
  return text.split("\n").some((raw) => {
    const t = raw.trim();
    return isHeading(t) || TAG_RE.test(stripMarkdown(t.replace(LIST_PREFIX_RE, "")));
  });
}

function walkBlocks(content: readonly BetaContentBlock[], web: WebState): Walk {
  let text = "";
  const spans: Span[] = [];
  const warnings: string[] = [];
  let usedWebSearch = false;
  let preambleEnd = 0;
  let sawSearch = false;
  // A non-text block (search, result, thinking, fallback) between two text blocks is a line break:
  // the model rarely starts the text after a search with "\n". Adjacent text blocks (citation splits) stay joined.
  let afterNonText = false;
  for (const block of content) {
    if (block.type !== "text") afterNonText = true;
    if (block.type === "server_tool_use" && !sawSearch) {
      sawSearch = true;
      if (!hasStructure(text)) preambleEnd = text.length;
    }
    if (block.type === "server_tool_use" && block.name === "web_search") usedWebSearch = true;
    if (block.type === "web_search_tool_result") {
      usedWebSearch = true;
      // max_uses_exceeded is the per-answer search cap we set to bound cost, not a failure worth flagging.
      if (!Array.isArray(block.content) && block.content.error_code !== "max_uses_exceeded") {
        const why = SEARCH_ERROR_TEXT[block.content.error_code] ?? block.content.error_code;
        warnings.push(`A web search failed (${why}); the answer may be missing web sources.`);
      }
    }
    if (block.type !== "text") continue;
    if (afterNonText && text && !text.endsWith("\n")) text += "\n";
    afterNonText = false;
    const start = text.length;
    text += block.text;
    const ids: string[] = [];
    const cited: string[] = [];
    for (const c of block.citations ?? []) {
      if (c.type !== "web_search_result_location") continue;
      const id = webIdFor(web, c.url, c.title, c.cited_text);
      if (!ids.includes(id)) ids.push(id);
      if (c.cited_text) cited.push(c.cited_text);
    }
    if (ids.length) spans.push({ start, end: text.length, ids, cited });
  }
  return { text, spans, usedWebSearch, warnings, preambleEnd };
}

/** Digits only, without leading or trailing zeros: 46.2% -> "462", 0.462 -> "462", $391B -> "391", 391,000,000,000 -> "391". */
function figureSignature(token: string): string {
  return token.replace(/\D/g, "").replace(/^0+/, "").replace(/0+$/, "");
}

function figureSignatures(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(figureSignature).filter(Boolean);
}

/**
 * Cheap check that every figure in a fact appears in its evidence (referenced docs + cited web text).
 * Compares digit signatures, so units, separators and B/M/K scaling do not matter; bare years are skipped.
 */
function figuresBacked(text: string, evidence: string[]): boolean {
  const claimed = (text.match(NUMBER_RE) ?? []).filter((t) => !YEAR_RE.test(t)).map(figureSignature).filter(Boolean);
  if (claimed.length === 0) return true;
  const exact = new Set(evidence);
  return claimed.every((sig) => exact.has(sig) || (sig.length >= MIN_PREFIX_SIG && evidence.some((e) => e.startsWith(sig))));
}

type Line = { text: string; start: number; end: number };

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const raw of text.split("\n")) {
    lines.push({ text: raw, start, end: start + raw.length });
    start += raw.length + 1;
  }
  return lines;
}

function stripMarkdown(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").trim();
}

/** Remove [S1]/[W2, S3] markers; return the cleaned text and the ids they named. */
function extractMarkers(s: string): { text: string; ids: string[] } {
  const ids: string[] = [];
  const text = s.replace(MARKER_RE, (_m, list: string) => {
    for (const id of list.split(/[,;]/)) {
      const clean = id.trim().toUpperCase();
      if (clean && !ids.includes(clean)) ids.push(clean);
    }
    return "";
  });
  return { text: text.replace(/\s+([.,;:])/g, "$1").replace(/\s{2,}/g, " ").trim(), ids };
}

type Counters = {
  untagged: number;
  downgraded: number;
  unverified: number;
  unknownRefs: Set<string>;
  scores: number;
  figures: number;
  noBasis: number;
};

/** Known citation ids, and the figure signatures of each supplied doc (S#). */
type Sources = { known: Set<string>; docFigures: Map<string, string[]> };

function toClaim(rawLine: string, lineRefs: string[], lineCited: string[], src: Sources, n: Counters): Claim | null {
  let body = stripMarkdown(rawLine.replace(LIST_PREFIX_RE, ""));
  const tag = TAG_RE.exec(body);
  let kind: ClaimKind = "interpretation";
  if (tag) {
    kind = TAG_KIND[tag[1].toUpperCase()];
    body = body.slice(tag[0].length);
  } else {
    n.untagged += 1;
  }
  const { text, ids } = extractMarkers(body);
  if (!text) return null;
  const refs: string[] = [];
  // W# numbering is assigned here from API citations, so a W# the model typed itself cannot be trusted
  // to point at the right page. Only S# markers come from the text; W# refs come from citations.
  const dataIds = ids.filter((id) => id.startsWith("S"));
  for (const id of [...dataIds, ...lineRefs]) {
    if (!src.known.has(id)) {
      n.unknownRefs.add(id);
      continue;
    }
    if (!refs.includes(id)) refs.push(id);
  }
  let demoted: "downgraded" | "unverified" | null = null;
  if (kind === "fact" && refs.length === 0) demoted = "downgraded";
  if (kind === "fact" && refs.length > 0) {
    const evidence = [...refs.flatMap((id) => src.docFigures.get(id) ?? []), ...lineCited.flatMap(figureSignatures)];
    if (!figuresBacked(text, evidence)) demoted = "unverified";
  }
  if (demoted) kind = "interpretation";
  // The model's own scores are banned; a probability copied from a cited source (e.g. futures-implied odds) is data.
  if (kind !== "fact" && SCORE_RE.test(text)) {
    n.scores += 1;
    return null;
  }
  if (demoted) n[demoted] += 1;
  if (kind === "estimate" && refs.length === 0) n.noBasis += 1;
  if (kind !== "fact" && refs.length === 0 && FIGURE_RE.test(text)) n.figures += 1;
  return { kind, text, refs };
}

function counterWarnings(n: Counters): string[] {
  const w: string[] = [];
  const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);
  if (n.downgraded) w.push(`${n.downgraded} ${plural(n.downgraded, "statement was", "statements were")} labelled as fact without a source and ${plural(n.downgraded, "is", "are")} shown as interpretation.`);
  if (n.unverified) w.push(`${n.unverified} ${plural(n.unverified, "statement", "statements")} labelled as fact ${plural(n.unverified, "contains", "contain")} figures not found in ${plural(n.unverified, "its", "their")} cited sources and ${plural(n.unverified, "is", "are")} shown as interpretation.`);
  if (n.untagged) w.push(`${n.untagged} ${plural(n.untagged, "line had", "lines had")} no label and ${plural(n.untagged, "is", "are")} shown as interpretation.`);
  if (n.unknownRefs.size) w.push(`Removed references to unknown sources: ${[...n.unknownRefs].join(", ")}.`);
  if (n.scores) w.push(`Removed ${n.scores} ${plural(n.scores, "line", "lines")} that stated a confidence or probability score.`);
  if (n.noBasis) w.push(`${n.noBasis} ${plural(n.noBasis, "estimate has", "estimates have")} no cited basis.`);
  if (n.figures) w.push(`${n.figures} unsourced ${plural(n.figures, "line contains", "lines contain")} figures; treat them as unverified.`);
  return w;
}

const isHeading = (s: string) => /^#{1,6}\s+/.test(s);
const isRule = (s: string) => /^([-*_])\1{2,}$/.test(s);

/**
 * Parse the analyst's final message.
 * Walks blocks in order, concatenates text, maps each text block's web citations to W# ids (deduped by url),
 * splits into lines -> claims. Facts with no refs, or with figures missing from their sources, are downgraded to
 * interpretation, with a warning. Untagged text before the first search is dropped.
 */
export function parseAnalystMessage(content: readonly BetaContentBlock[], contextDocs: readonly ContextDoc[]): ParsedAnalyst {
  const web: WebState = { byUrl: new Map(), resultTitles: collectResultTitles(content) };
  const walk = walkBlocks(content, web);
  const webCitations = [...web.byUrl.values()];
  const known = new Set<string>([...contextDocs.map((d) => d.id.toUpperCase()), ...webCitations.map((c) => c.id)]);
  const docFigures = new Map(contextDocs.map((d) => [d.id.toUpperCase(), figureSignatures(`${d.title}\n${d.provenance?.asOf ?? ""}\n${d.content}`)]));
  const src: Sources = { known, docFigures };
  const n: Counters = { untagged: 0, downgraded: 0, unverified: 0, unknownRefs: new Set(), scores: 0, figures: 0, noBasis: 0 };

  const sections: AnalystSection[] = [];
  let current: AnalystSection = { claims: [] };
  for (const line of splitLines(walk.text)) {
    const trimmed = line.text.trim();
    if (!trimmed || isRule(trimmed) || line.end <= walk.preambleEnd) continue;
    if (isHeading(trimmed)) {
      if (current.claims.length) sections.push(current);
      const heading = extractMarkers(stripMarkdown(trimmed.replace(/^#{1,6}\s+/, "").replace(TAG_RE, ""))).text;
      current = { heading: heading || undefined, claims: [] };
      continue;
    }
    const lineSpans = walk.spans.filter((s) => s.start < line.end && s.end > line.start);
    const claim = toClaim(trimmed, lineSpans.flatMap((s) => s.ids), lineSpans.flatMap((s) => s.cited), src, n);
    if (claim) current = { ...current, claims: [...current.claims, claim] };
  }
  if (current.claims.length) sections.push(current);

  const used = new Set(sections.flatMap((s) => s.claims.flatMap((c) => c.refs)));
  const dataCitations: Citation[] = contextDocs
    .filter((d) => used.has(d.id.toUpperCase()))
    .map((d) => ({ id: d.id.toUpperCase(), kind: "data", title: d.title, url: d.provenance?.url, provenance: d.provenance }));

  return {
    sections,
    citations: [...dataCitations, ...webCitations],
    usedWebSearch: walk.usedWebSearch,
    warnings: [...walk.warnings, ...counterWarnings(n)],
  };
}
