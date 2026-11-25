/** Validation of POST /api/research and /api/briefing bodies. Pure; unit-tested. */
import { validatePortfolioSummary, type Validated } from "./portfolio-summary";
import {
  MAX_QUESTION_CHARS,
  MAX_THESIS_CHARS,
  MIN_THESIS_CHARS,
  MODE_SYMBOLS,
  MOVE_WINDOWS,
  RESEARCH_MODES,
  type BriefingRequest,
  type MoveWindow,
  type ResearchMode,
  type ResearchRequest,
} from "./types";

const SYMBOL_RE = /^[A-Za-z0-9.@=\-^_]{1,24}$/;
const REQUEST_KEYS = ["mode", "symbols", "question", "thesis", "window", "portfolio"];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function bad(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function parseSymbols(raw: unknown): Validated<string[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return bad("symbols must be a list of tickers.");
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string" || !SYMBOL_RE.test(s.trim())) return bad(`"${String(s).slice(0, 24)}" is not a valid ticker.`);
    const up = s.trim().toUpperCase();
    if (!out.includes(up)) out.push(up);
  }
  return { ok: true, value: out };
}

function needsQuestion(mode: ResearchMode): boolean {
  return mode === "opportunities";
}

export function parseResearchRequest(raw: unknown): Validated<ResearchRequest> {
  if (!isObj(raw)) return bad("Send a JSON object.");
  const extra = Object.keys(raw).filter((k) => !REQUEST_KEYS.includes(k));
  if (extra.length) return bad(`Unexpected field(s): ${extra.slice(0, 3).join(", ")}.`);
  const mode = raw.mode;
  if (typeof mode !== "string" || !(RESEARCH_MODES as readonly string[]).includes(mode)) {
    return bad(`mode must be one of ${RESEARCH_MODES.join(", ")}.`);
  }
  const m = mode as ResearchMode;
  const symbols = parseSymbols(raw.symbols);
  if (!symbols.ok) return symbols;
  const [min, max] = MODE_SYMBOLS[m];
  if (symbols.value.length < min || symbols.value.length > max) {
    return bad(min === max ? `This mode needs ${min === 0 ? "no tickers" : `exactly ${min} ticker${min > 1 ? "s" : ""}`}.` : `This mode takes ${min} to ${max} tickers.`);
  }
  if (raw.question !== undefined && typeof raw.question !== "string") return bad("question must be text.");
  const question = (raw.question ?? "").toString().trim();
  if (question.length > MAX_QUESTION_CHARS) return bad(`Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
  if (needsQuestion(m) && question.length < 3) return bad("Describe the theme you want research ideas for.");

  const req: ResearchRequest = { mode: m, symbols: symbols.value, question };
  if (m === "challenge") {
    const thesis = typeof raw.thesis === "string" ? raw.thesis.trim() : "";
    if (thesis.length < MIN_THESIS_CHARS) return bad(`Paste a thesis of at least ${MIN_THESIS_CHARS} characters.`);
    if (thesis.length > MAX_THESIS_CHARS) return bad(`Theses are limited to ${MAX_THESIS_CHARS} characters.`);
    req.thesis = thesis;
  } else if (raw.thesis !== undefined && raw.thesis !== "") {
    return bad("thesis is only used in challenge mode.");
  }
  if (m === "explain_move") {
    const w = raw.window ?? "1d";
    if (typeof w !== "string" || !(MOVE_WINDOWS as readonly string[]).includes(w)) return bad(`window must be one of ${MOVE_WINDOWS.join(", ")}.`);
    req.window = w as MoveWindow;
  } else if (raw.window !== undefined) {
    return bad("window is only used in explain_move mode.");
  }
  if (raw.portfolio !== undefined && raw.portfolio !== null) {
    const p = validatePortfolioSummary(raw.portfolio);
    if (!p.ok) return bad(`Portfolio summary rejected: ${p.error}`);
    req.portfolio = p.value;
  }
  if (m === "portfolio" && !req.portfolio) return bad("Portfolio review needs your saved portfolio. Turn on \"Include my saved portfolio\".");
  return { ok: true, value: req };
}

export function parseBriefingRequest(raw: unknown): Validated<BriefingRequest> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (!isObj(raw)) return bad("Send a JSON object.");
  const extra = Object.keys(raw).filter((k) => k !== "portfolio" && k !== "refresh");
  if (extra.length) return bad(`Unexpected field(s): ${extra.slice(0, 3).join(", ")}.`);
  if (raw.refresh !== undefined && typeof raw.refresh !== "boolean") return bad("refresh must be true or false.");
  const out: BriefingRequest = { refresh: raw.refresh === true };
  if (raw.portfolio !== undefined && raw.portfolio !== null) {
    const p = validatePortfolioSummary(raw.portfolio);
    if (!p.ok) return bad(`Portfolio summary rejected: ${p.error}`);
    out.portfolio = p.value;
  }
  return { ok: true, value: out };
}
