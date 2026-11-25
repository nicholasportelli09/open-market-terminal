/**
 * Client-safe types for AI output. Server code (src/lib/server/ai/*) produces these; UI renders them.
 * No secrets, no SDK imports here.
 */
import type { Provenance } from "@/lib/provenance";

/**
 * fact = verifiable statement backed by supplied data (S#) or a web citation (W#).
 * estimate = forecast / projection / estimate, with its basis cited where possible.
 * interpretation = the model's view or opinion. Never shown as verified.
 */
export type ClaimKind = "fact" | "estimate" | "interpretation";

export type Citation = {
  /** "W1", "W2"... for web search results; "S1", "S2"... for data we supplied. */
  id: string;
  kind: "web" | "data";
  title: string;
  url?: string;
  /** Exact text the model cited from the web page (web citations only). */
  citedText?: string;
  /** Provenance of the supplied data document (data citations only). */
  provenance?: Provenance;
};

export type Claim = {
  kind: ClaimKind;
  text: string;
  /** Citation ids ("S1", "W2") that back this claim. */
  refs: string[];
};

export type AnalystSection = {
  heading?: string;
  claims: Claim[];
};

export type AnalystAnswer = {
  sections: AnalystSection[];
  /** Only citations referenced by at least one claim, plus every web result the model cited. */
  citations: Citation[];
  model: string;
  generatedAt: string;
  usedWebSearch: boolean;
  /** Plain-language notes: downgraded facts, truncated output, failed searches, and similar. */
  warnings: string[];
};

export const CLAIM_LABEL: Record<ClaimKind, string> = {
  fact: "Fact",
  estimate: "Estimate",
  interpretation: "Interpretation",
};
