import type { FlexAccount, IbkrSnapshot } from "@/lib/portfolio/brokers";
import { IBKR_MAX_REQUEST_BYTES, contractKey, parseFlexStatement } from "@/lib/portfolio/brokers";
import { createGuard, ipFrom } from "@/lib/server/ai/guard";
import { badRequest, ok, rateLimited, upstream } from "@/lib/server/api";
import { IbkrError, fetchFlexAccounts, snapshotFromAccounts } from "@/lib/server/ibkr";

export const dynamic = "force-dynamic";
/** SendRequest, then up to ~40 s of GetStatement polling, then symbol lookups. */
export const maxDuration = 60;

/** Far above any real account; bounds the quote lookups one request can cause. */
const MAX_ACCOUNTS = 50;
const MAX_CONTRACTS = 500;
const TOO_LARGE = "The file is too large (4 MB at most). In IBKR, set Open Positions to Summary level detail.";
const TOKEN_RE = /^[A-Za-z0-9]{10,64}$/;
const QUERY_RE = /^\d{1,12}$/;

/** Per-IP limit: IBKR itself allows 10 requests a minute per token; a sync makes several. */
const guard = createGuard({ windowMs: 10 * 60_000, maxPerWindow: 8, dailyLimit: () => 5_000 });

type Body = { token?: unknown; queryId?: unknown; xml?: unknown };

/**
 * POST /api/brokers/ibkr {token, queryId} | {xml} -> ApiResult<IbkrSnapshot>.
 * Reads the user's own IBKR Flex report (live with a token, or an uploaded XML file), maps holdings to app
 * symbols and returns them. Read-only; the token is used for this request only and never stored or logged.
 */
/** The body as text, read as a stream and abandoned past `max` bytes (a missing Content-Length cannot bypass it). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function tooBig(accounts: FlexAccount[]): string | null {
  if (accounts.length > MAX_ACCOUNTS) return `The report has ${accounts.length} accounts; ${MAX_ACCOUNTS} at most.`;
  const contracts = new Set(accounts.flatMap((a) => a.positions.map(contractKey)));
  return contracts.size > MAX_CONTRACTS ? `The report has ${contracts.size} different holdings; ${MAX_CONTRACTS} at most.` : null;
}

export async function POST(req: Request) {
  // Rate limit first, so a limited client cannot make the server read and parse a large body.
  const gate = guard.check(ipFrom(req));
  if (!gate.allowed) return rateLimited("Too many IBKR syncs from this address. Wait a few minutes.", gate.retryAfterSec);
  let body: Body;
  try {
    const text = await readLimited(req, IBKR_MAX_REQUEST_BYTES);
    if (text === null) return badRequest(TOO_LARGE);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Body;
  } catch {
    return badRequest("Send JSON with a token and Query ID, or a Flex XML file.");
  }

  try {
    let accounts: FlexAccount[];
    if (typeof body.xml === "string") {
      const parsed = parseFlexStatement(body.xml);
      if (!parsed.ok) return badRequest(parsed.error);
      accounts = parsed.accounts;
    } else {
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const queryId = typeof body.queryId === "string" ? body.queryId.trim() : "";
      if (!TOKEN_RE.test(token)) return badRequest("Paste the Flex Web Service token from IBKR (letters and digits only).");
      if (!QUERY_RE.test(queryId)) return badRequest("The Query ID is the number shown next to your Flex Query in IBKR.");
      accounts = await fetchFlexAccounts(token, queryId);
    }
    const limit = tooBig(accounts);
    if (limit) return badRequest(limit);
    const snapshot = await snapshotFromAccounts(accounts);
    return ok<IbkrSnapshot>(snapshot, [{ source: "ibkr", asOf: snapshot.accounts[0]?.asOf ?? snapshot.fetchedAt }]);
  } catch (err) {
    if (err instanceof IbkrError) {
      if (err.kind === "auth" || err.kind === "query" || err.kind === "format") return badRequest(err.message);
      if (err.kind === "busy") return rateLimited(err.message, 60);
      return upstream("ibkr", err, err.message);
    }
    return upstream("ibkr", err, "The IBKR report could not be read right now. Try again shortly.");
  }
}
