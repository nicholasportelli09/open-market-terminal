/**
 * Research analyst + daily briefing contract. Pure types and constants (no server imports), so client
 * components may import from here too.
 */
import type { AnalystAnswer } from "@/lib/ai/types";

export const RESEARCH_MODES = ["analyze", "explain_move", "compare", "challenge", "portfolio", "opportunities"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export const MOVE_WINDOWS = ["1d", "1w", "1m", "3m", "ytd", "1y"] as const;
export type MoveWindow = (typeof MOVE_WINDOWS)[number];

export const MAX_SYMBOLS = 4;
export const MAX_QUESTION_CHARS = 1_000;
export const MIN_THESIS_CHARS = 20;
export const MAX_THESIS_CHARS = 2_500;
export const MAX_PORTFOLIO_POSITIONS = 40;
export const MAX_PORTFOLIO_CURRENCIES = 12;
/** Serialized size cap for a client-sent portfolio summary. */
export const MAX_PORTFOLIO_JSON = 12_000;

/** Ticker counts each mode accepts: [min, max]. */
export const MODE_SYMBOLS: Record<ResearchMode, [number, number]> = {
  analyze: [1, 1],
  explain_move: [1, 1],
  compare: [2, MAX_SYMBOLS],
  challenge: [0, 2],
  portfolio: [0, 0],
  opportunities: [0, MAX_SYMBOLS],
};

/**
 * What the browser may send about the saved portfolio. Values are in the base currency; percentages are
 * percent numbers (12.5 = 12.5%). Anything outside this shape is rejected by the server.
 */
export type PortfolioPositionSummary = {
  symbol: string;
  currency: string;
  /** Market value in the base currency. */
  value: number;
  /** Share of total value, percent; null when the total is not positive. */
  weightPct: number | null;
  /** Unrealized gain / loss on cost, percent; null when the cost basis is zero. */
  unrealizedPct: number | null;
};

export type PortfolioSummary = {
  baseCurrency: string;
  /** Valuation date, YYYY-MM-DD. */
  asOf: string;
  totals: { totalValue: number; marketValue: number; cash: number; unrealized: number };
  cashPct: number | null;
  positions: PortfolioPositionSummary[];
  currencyExposure: { currency: string; pct: number | null }[];
  /** False when some prices or FX rates were missing, so totals cover only what could be valued. */
  complete: boolean;
};

export type ResearchRequest = {
  mode: ResearchMode;
  symbols: string[];
  question: string;
  thesis?: string;
  window?: MoveWindow;
  portfolio?: PortfolioSummary;
};

export type Briefing = {
  answer: AnalystAnswer;
  wordCount: number;
  /** The market day the briefing covers (last session when markets are closed), YYYY-MM-DD. */
  marketDate: string;
  /** Plain note on the session, e.g. "US markets are closed (weekend); this covers Friday's session." */
  sessionNote: string;
  generatedAt: string;
  /** True when served from the 30-minute server cache. */
  fromCache: boolean;
};

export type BriefingRequest = { portfolio?: PortfolioSummary; refresh?: boolean };
