/**
 * Thesis for one screened company: (a) the research analyst with web search writes labelled, cited sections;
 * (b) a structured call proposes bear/base/bull DCF assumptions that cite the thesis evidence; (c) this app
 * values each set with runDcf. The AI never states a fair value. Requires the AI provider key (GEMINI_API_KEY by default).
 */
import type { CompanySnapshot } from "@/lib/company-types";
import { quoteProvenance } from "@/lib/market-session";
import {
  FORECAST_YEARS, LIMITS, evidenceFrom, validateScenarios, valueScenarios,
  type DcfBase, type ThesisPrice, type ThesisResult,
} from "@/lib/scanner/thesis";
import { runAnalyst } from "../ai/analyst";
import { isAiError } from "../ai/errors";
import type { ContextDoc } from "../ai/parse";
import { runStructured, type JsonSchema } from "../ai/structured";
import { fetchQuotes } from "../cnbc";
import { quoteSymbol } from "../company";
import { thesisContext } from "./context";
import { RowError } from "./row";
import { getRow } from "./screen";

const SECTIONS = ["In short", "For", "Against", "Catalysts and risks"];
/** About ten lines: one in "In short", up to three in each other section. */
const THESIS_LIMITS = { maxLines: 10, perSection: 3, maxSections: SECTIONS.length };

const yearly = { type: "array", items: { type: "number" }, description: `Exactly ${FORECAST_YEARS} decimals, year 1 first (0.05 = 5%).` };

const SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scenarios"],
  properties: {
    scenarios: {
      type: "array",
      description: "Exactly three items: bear, base and bull.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "revenueGrowth", "fcfMargin", "terminalGrowth", "wacc", "rationale", "evidence"],
        properties: {
          id: { type: "string", enum: ["bear", "base", "bull"] },
          revenueGrowth: yearly,
          fcfMargin: yearly,
          terminalGrowth: { type: "number", description: "Perpetual growth after year 5, decimal, at most 0.04 and below wacc." },
          wacc: { type: "number", description: "Discount rate, decimal between 0.05 and 0.15." },
          rationale: { type: "string", description: "One plain sentence under 25 words explaining the assumptions, citing evidence ids such as E3." },
          evidence: { type: "array", items: { type: "string" }, description: "Evidence ids (E1, E2...) the rationale relies on." },
        },
      },
    },
  },
};

export class ThesisInputError extends Error {}

function dcfBaseOf(s: CompanySnapshot): DcfBase | string {
  const { revenueTTM, netDebt, sharesOutstanding } = s.metrics;
  if (s.financialCompany) return "A free-cash-flow DCF is not meaningful for banks and insurers (debt is part of operations), so no scenarios are valued.";
  if (s.currencyMismatch) return "The share price and the filings use different currencies, so no scenarios are valued.";
  const missing = [
    revenueTTM.value === null || revenueTTM.value <= 0 ? "TTM revenue" : "",
    netDebt.value === null ? "net debt" : "",
    sharesOutstanding.value === null || sharesOutstanding.value <= 0 ? "share count" : "",
  ].filter(Boolean);
  if (missing.length) return `No scenarios: the filings lack ${missing.join(", ")} needed for the DCF.`;
  return {
    revenueTTM: revenueTTM.value as number,
    netDebt: netDebt.value as number,
    shares: sharesOutstanding.value as number,
    currency: s.currency,
    provenance: { revenueTTM: revenueTTM.provenance, netDebt: netDebt.provenance, shares: sharesOutstanding.provenance },
  };
}

/** Fresh CNBC regular-session price; falls back to the snapshot price. */
async function livePrice(symbol: string, s: CompanySnapshot): Promise<ThesisPrice | null> {
  try {
    const [q] = await fetchQuotes([quoteSymbol(symbol)]);
    if (q && q.last !== null && q.last > 0) {
      const now = new Date();
      const p = quoteProvenance({ symbol: q.symbol, type: q.type || "STOCK", exchange: q.exchange, country: q.country || "US", time: q.time, delayed: q.delayed }, now);
      return { value: q.last, currency: q.currency || s.currency, provenance: { ...p, url: `https://www.cnbc.com/quotes/${encodeURIComponent(q.symbol)}`, note: "Last regular-session price" } };
    }
  } catch (err) {
    console.error("[scanner.thesis] quote failed", err instanceof Error ? err.message : err);
  }
  const v = s.price.value;
  return v !== null && v > 0 ? { value: v, currency: s.quoteCurrency ?? s.currency, provenance: s.price.provenance } : null;
}

function evidenceDoc(evidence: ReturnType<typeof evidenceFrom>): ContextDoc {
  return {
    id: "S4",
    title: "Thesis evidence written in step one (ids E1, E2...), each labelled fact, estimate or interpretation",
    content: evidence.map((e) => `${e.id} [${e.kind}] (${e.section || "General"}) ${e.text}${e.refs.length ? ` [refs ${e.refs.join(", ")}]` : ""}`).join("\n"),
  };
}

const SCENARIO_PROMPT = `Propose three assumption sets (bear, base, bull) for a ${FORECAST_YEARS}-year free-cash-flow-margin DCF of this company.
For each: revenueGrowth (exactly ${FORECAST_YEARS} yearly decimals, each between ${LIMITS.growth.min} and ${LIMITS.growth.max}), fcfMargin (exactly ${FORECAST_YEARS} yearly decimals, each between ${LIMITS.margin.min} and ${LIMITS.margin.max}), terminalGrowth (at most ${LIMITS.terminalMax} and below wacc), wacc (between ${LIMITS.wacc.min} and ${LIMITS.wacc.max}).
Anchor the paths on the reported TTM revenue growth, 3-year CAGR and FCF margin in S1 and on the evidence in S4. Each rationale cites the evidence ids it relies on.
Do not state fair values, target prices, upside or probabilities: the terminal computes values from your assumptions.`;

export async function buildThesis(symbol: string): Promise<ThesisResult> {
  const { row, snapshot } = await getRow(symbol).catch((err: unknown) => {
    throw err instanceof RowError ? new ThesisInputError(err.message) : err;
  });
  const context = thesisContext(row, snapshot);
  const answer = await runAnalyst({
    task: "Write a short, balanced research thesis on one stock from an opportunity screen, for a non-expert reader who skims.",
    question: `Write a research thesis on ${row.name} (${row.symbol}) with exactly these sections, in order: ${SECTIONS.map((s) => `"## ${s}"`).join(", ")}. "In short" is one line: what the company does and the core debate. "For" and "Against" give the strongest points only, equally weighted. "Catalysts and risks" gives dated events and the biggest risk. Use S1-S3 for figures and web search for recent news and guidance.`,
    limits: THESIS_LIMITS,
    context,
    webSearch: { enabled: true, maxUses: 2 },
    effort: "low",
  });
  const evidence = evidenceFrom(answer);
  const base = dcfBaseOf(snapshot);
  const price = await livePrice(row.symbol, snapshot);
  const warnings: string[] = [];
  let scenarios: ThesisResult["scenarios"] = null;
  let scenariosNote: string | null = typeof base === "string" ? base : null;

  if (typeof base !== "string") {
    try {
      const raw = await runStructured<unknown>({
        task: "Turn a research thesis into DCF assumption sets. Assumptions only; never values.",
        prompt: SCENARIO_PROMPT,
        context: [...context, evidenceDoc(evidence)],
        schema: SCHEMA,
        effort: "low",
      });
      const checked = validateScenarios(raw, new Set(evidence.map((e) => e.id)));
      if (checked.ok) {
        const comparable = price && price.currency === base.currency ? price.value : null;
        if (price && comparable === null) warnings.push(`Price is in ${price.currency} but filings are in ${base.currency}: return potential is not shown.`);
        scenarios = valueScenarios(base, checked.scenarios, comparable);
        warnings.push(...checked.warnings);
      } else {
        scenariosNote = `The AI's scenario assumptions were rejected: ${checked.errors.slice(0, 3).join(" ")}`;
      }
    } catch (err) {
      if (isAiError(err) && err.code === "not_configured") throw err;
      scenariosNote = `Scenario step failed: ${err instanceof Error ? err.message : "unknown error"}. The thesis text above is still valid.`;
    }
  }

  return {
    symbol: row.symbol,
    name: row.name,
    answer,
    evidence,
    scenarios,
    scenariosNote,
    dcfBase: typeof base === "string" ? null : base,
    price,
    model: answer.model,
    generatedAt: new Date().toISOString(),
    warnings: [...answer.warnings, ...warnings],
  };
}
