/**
 * SEC submissions for the scanner: the recent-filings list (for 8-K catalysts) plus the company profile.
 * One request per company, cached 6 hours. The parsed profile is also stored under the key sec.ts uses for
 * companySubmissions(), so the following companySnapshot() call reuses it instead of downloading it again.
 */
import { cached, put } from "../cache";
import { parseSubmissions, secUserAgent, SecError, type CompanyProfile } from "../sec";
import { padCik } from "../sec-fundamentals";
import type { Filing } from "./catalysts";

const TIMEOUT_MS = 15_000;
const TTL_MS = 6 * 3_600_000;
/** sec.ts caches companySubmissions() under this key with a 24h TTL; a fresh profile there is always valid. */
const PROFILE_KEY = (cik: string) => `sec:sub:${cik}`;

export type Submissions = { profile: CompanyProfile; filings: Filing[]; fetchedAt: string; url: string };

type RecentColumns = Record<string, unknown[]>;

function column(recent: RecentColumns, name: string, i: number): string {
  const v = recent[name]?.[i];
  return typeof v === "string" ? v : "";
}

/** Columnar `filings.recent` -> rows. Missing or malformed columns give an empty list, never a throw. */
export function parseRecentFilings(raw: unknown): Filing[] {
  const recent = (raw as { filings?: { recent?: RecentColumns } } | null)?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return [];
  const out: Filing[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form = column(recent, "form", i);
    const filingDate = column(recent, "filingDate", i);
    if (!form || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) continue;
    out.push({
      form,
      filingDate,
      accessionNumber: column(recent, "accessionNumber", i),
      primaryDocument: column(recent, "primaryDocument", i),
      items: column(recent, "items", i),
    });
  }
  return out;
}

async function fetchSubmissions(cik: string): Promise<unknown> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": secUserAgent(), Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new SecError(`SEC request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 429) throw new SecError("SEC rate limit reached (429).", 429);
  if (res.status === 403) throw new SecError("SEC refused the request (403). Set SEC_USER_AGENT to 'App name contact@email'.", 403);
  if (!res.ok) throw new SecError(`SEC responded ${res.status}`, res.status);
  try {
    return await res.json();
  } catch {
    throw new SecError("SEC returned malformed JSON");
  }
}

/** Recent filings + profile for one CIK. Throws SecError on transport failures (not cached). */
export async function scannerSubmissions(rawCik: string): Promise<Submissions> {
  const cik = padCik(rawCik);
  return cached(`scanner:sub:${cik}`, TTL_MS, async () => {
    const raw = await fetchSubmissions(cik);
    const profile = parseSubmissions(raw, cik);
    put(PROFILE_KEY(cik), profile);
    return {
      profile,
      filings: parseRecentFilings(raw),
      fetchedAt: new Date().toISOString(),
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=40`,
    };
  });
}
