/**
 * Builds AnalystData for one symbol from the licensed providers. Every section is fetched on its own,
 * so one failing endpoint (plan, rate limit) never hides the others; each failure becomes an issue.
 */
import type { AnalystData, AnalystIssue, AnalystSection, DistributionMonth } from "@/lib/analyst-types";
import type { Provenance } from "@/lib/provenance";
import { env } from "../config";
import {
  buildDistribution,
  consensusFromTrend,
  finnhubProvenance,
  fmpTrendProvenance,
  normConsensusFmp,
  normHistory,
  normTargetsFmp,
  normTrendFinnhub,
  normTrendFmp,
} from "./normalize";
import { finnhubRecommendation, fmpGet, issueMessage, ProviderError, type Fetched, type Provider } from "./providers";

/** Price-target notes requested per call (FMP paginates price-target-news). */
const NEWS_LIMIT = "100";
/** Monthly snapshots requested from grades-historical. */
const TREND_LIMIT = "24";

type Settled = { ok: true; value: Fetched } | { ok: false; error: unknown };

async function settle(p: Promise<Fetched>): Promise<Settled> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

function skipped(): Promise<Settled> {
  return Promise.resolve({ ok: false, error: null });
}

function issueFrom(section: AnalystSection, provider: Provider, error: unknown, prefix = ""): AnalystIssue {
  if (error instanceof ProviderError) {
    console.error(`[analyst] ${error.message}`);
    return { section, provider, kind: error.kind, message: `${prefix}${issueMessage(provider, error.kind)}` };
  }
  console.error("[analyst]", error instanceof Error ? error.message : error);
  return { section, provider, kind: "upstream", message: `${prefix}${issueMessage(provider, "upstream")}` };
}

function notConfiguredIssue(section: AnalystSection): AnalystIssue {
  return { section, provider: "fmp", kind: "not_configured", message: issueMessage("fmp", "not_configured"), env: "FMP_API_KEY" };
}

export type AnalystBuild = { data: AnalystData; sources: Provenance[] };

/** Fetch and normalise everything. Call only when at least one provider key is set. */
export async function analystData(symbol: string): Promise<AnalystBuild> {
  const fmpKey = env.fmpApiKey();
  const finnhubKey = env.finnhubApiKey();
  const f = (endpoint: Parameters<typeof fmpGet>[0], extra?: Record<string, string>) =>
    fmpKey ? settle(fmpGet(endpoint, symbol, fmpKey, extra)) : skipped();

  const [ptConsensus, ptSummary, grConsensus, grHistorical, grades, news, finnhub] = await Promise.all([
    f("price-target-consensus"),
    f("price-target-summary"),
    f("grades-consensus"),
    f("grades-historical", { limit: TREND_LIMIT }),
    f("grades"),
    f("price-target-news", { page: "0", limit: NEWS_LIMIT }),
    finnhubKey ? settle(finnhubRecommendation(symbol, finnhubKey)) : skipped(),
  ]);

  const issues: AnalystIssue[] = [];
  const data: AnalystData = { symbol, issues, configured: { fmp: !!fmpKey, finnhub: !!finnhubKey } };

  // Price targets.
  if (!fmpKey) issues.push(notConfiguredIssue("targets"));
  else if (!ptConsensus.ok) issues.push(issueFrom("targets", "fmp", ptConsensus.error));
  else {
    const targets = normTargetsFmp(ptConsensus.value.body, ptSummary.ok ? ptSummary.value.body : null, symbol, ptConsensus.value.fetchedAt);
    if (targets) data.targets = targets;
  }

  // Consensus rating (FMP label, else derived from Finnhub's latest month).
  const fmpConsensus = grConsensus.ok ? normConsensusFmp(grConsensus.value.body, symbol, grConsensus.value.fetchedAt) : null;
  if (fmpKey && !grConsensus.ok) issues.push(issueFrom("consensus", "fmp", grConsensus.error));

  // Monthly trend: FMP grades-historical first, Finnhub recommendation trends as fallback.
  let trend: DistributionMonth[] = [];
  let trendProv: Provenance | null = null;
  if (grHistorical.ok) {
    trend = normTrendFmp(grHistorical.value.body);
    if (trend.length) trendProv = fmpTrendProvenance(symbol, grHistorical.value.fetchedAt);
  }
  const finnhubTrend: DistributionMonth[] = finnhub.ok ? normTrendFinnhub(finnhub.value.body) : [];
  const usingFinnhub = !trend.length && finnhubTrend.length > 0;
  if (usingFinnhub && finnhub.ok) {
    trend = finnhubTrend;
    trendProv = finnhubProvenance(symbol, finnhub.value.fetchedAt);
  }
  if (!grHistorical.ok && fmpKey) {
    // Only claim the Finnhub fallback once Finnhub actually supplied a trend.
    issues.push(issueFrom("distribution", "fmp", grHistorical.error, usingFinnhub ? "Monthly history from FMP failed, using Finnhub. " : ""));
  }
  if (!finnhub.ok && finnhubKey && !trend.length) {
    issues.push(issueFrom("distribution", "finnhub", finnhub.error));
  }

  const consensus =
    fmpConsensus ?? (finnhub.ok && finnhubTrend.length ? consensusFromTrend(finnhubTrend, finnhubProvenance(symbol, finnhub.value.fetchedAt)) : null);
  if (consensus) data.consensus = consensus;
  const distribution = buildDistribution(consensus, trend, trendProv);
  if (distribution) data.distribution = distribution;
  if (!fmpKey && !finnhubKey) issues.push(notConfiguredIssue("consensus"));

  // Ratings history (grades, joined with price-target notes when the plan includes them).
  if (!fmpKey) issues.push(notConfiguredIssue("history"));
  else if (!grades.ok) issues.push(issueFrom("history", "fmp", grades.error));
  else {
    const history = normHistory(grades.value.body, news.ok ? news.value.body : null, symbol, grades.value.fetchedAt);
    if (history) data.history = history;
    if (!news.ok) issues.push(issueFrom("history", "fmp", news.error, "Price targets per analyst note are missing. "));
  }

  const sources = [data.consensus?.provenance, data.targets?.provenance, data.distribution?.trendProvenance, data.history?.provenance].filter(
    (p): p is Provenance => !!p,
  );
  return { data, sources };
}
