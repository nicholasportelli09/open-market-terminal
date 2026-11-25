import { ok } from "@/lib/server/api";
import { ENV_NAMES, providerStatus } from "@/lib/server/config";
import { aiLedger, weeklyBudgetFromEnv } from "@/lib/server/ai/budget";
import { aiModel } from "@/lib/server/ai/client";
import { fmpBudget, fmpDailyLimitFromEnv } from "@/lib/server/analyst/providers";

export const dynamic = "force-dynamic";

export type FeatureStatus = {
  id: string;
  label: string;
  available: boolean;
  /** Env var names that enable it (names only). Empty for keyless features. */
  requires: string[];
  note?: string;
};

/** Cost guards on this server instance (estimates; resets on a cold start). */
export type UsagePayload = {
  aiModel: string;
  aiWeekSpentUsdEstimate: number;
  aiWeeklyBudgetUsd: number;
  fmpCallsLast24h: number;
  fmpDailyLimit: number;
};

export type StatusPayload = { providers: ReturnType<typeof providerStatus>; features: FeatureStatus[]; usage: UsagePayload };

function usage(): UsagePayload {
  return {
    aiModel: aiModel(),
    aiWeekSpentUsdEstimate: Math.round(aiLedger.spent() * 10_000) / 10_000,
    aiWeeklyBudgetUsd: weeklyBudgetFromEnv(),
    fmpCallsLast24h: fmpBudget.used(),
    fmpDailyLimit: fmpDailyLimitFromEnv(),
  };
}

function aiNote(p: ReturnType<typeof providerStatus>): string | undefined {
  if (p.aiProvider === "gemini" && p.aiFallback) return "Gemini free tier first (no web search); Anthropic credits only when Gemini is out of quota or fails, capped weekly.";
  if (p.aiProvider === "gemini") return "Google Gemini free tier: no web search; answers use the terminal's sourced data.";
  if (p.aiProvider === "anthropic") return "Anthropic API credits, capped by AI_WEEKLY_BUDGET_USD.";
  return undefined;
}

/** Which providers are configured and which features that enables. Never returns values. */
export function GET() {
  const p = providerStatus();
  const features: FeatureStatus[] = [
    { id: "quotes", label: "Quotes, charts and movers (CNBC)", available: true, requires: [] },
    { id: "news", label: "News headlines (Google News)", available: true, requires: [] },
    { id: "macro", label: "Macro series (FRED)", available: true, requires: [] },
    {
      id: "fundamentals",
      label: "Company fundamentals (SEC EDGAR)",
      available: true,
      requires: [],
      note: p.secUserAgentSet ? undefined : `Set ${ENV_NAMES.secUserAgent} to identify this app to the SEC.`,
    },
    {
      id: "ai",
      label: "AI scanner theses, research analyst and daily briefing",
      available: p.ai,
      requires: [p.aiProvider === "anthropic" && !p.gemini ? ENV_NAMES.anthropicKey : ENV_NAMES.geminiKey],
      note: aiNote(p),
    },
    { id: "analyst-consensus", label: "Analyst consensus, price targets and rating history", available: p.fmp, requires: [ENV_NAMES.fmpKey] },
    { id: "recommendation-trends", label: "Recommendation trends (fallback)", available: p.finnhub, requires: [ENV_NAMES.finnhubKey] },
  ];
  const payload: StatusPayload = { providers: p, features, usage: usage() };
  return ok(payload, []);
}
