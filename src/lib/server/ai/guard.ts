/**
 * Abuse guard for AI routes: per-IP sliding window plus a per-instance daily cap (AI_DAILY_LIMIT, default 25).
 * In-memory, so limits are per server instance (each Vercel lambda instance counts separately).
 */

export type GuardResult = {
  allowed: boolean;
  /** 0 when allowed; otherwise seconds until a request would be accepted again. */
  retryAfterSec: number;
  reason?: "ip_window" | "daily_cap";
};

export type GuardOptions = {
  windowMs: number;
  maxPerWindow: number;
  /** Read on every check so env changes apply without a restart. */
  dailyLimit: () => number;
  now?: () => number;
};

export type Guard = {
  /** Checks and, when allowed, records one request for `ip`. */
  check(ip: string): GuardResult;
  reset(): void;
};

export const AI_WINDOW_MS = 10 * 60_000;
export const AI_MAX_PER_WINDOW = 6;
export const AI_DEFAULT_DAILY_LIMIT = 25;
const MAX_TRACKED_IPS = 5_000;
const DAY_MS = 86_400_000;

export function dailyLimitFromEnv(): number {
  const raw = process.env.AI_DAILY_LIMIT?.trim();
  if (!raw) return AI_DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : AI_DEFAULT_DAILY_LIMIT;
}

export function createGuard(opts: GuardOptions): Guard {
  const now = opts.now ?? Date.now;
  let hits = new Map<string, number[]>();
  let day = { key: -1, count: 0 };

  function prune(t: number) {
    if (hits.size <= MAX_TRACKED_IPS) return;
    const next = new Map<string, number[]>();
    for (const [ip, times] of hits) {
      const live = times.filter((x) => t - x < opts.windowMs);
      if (live.length) next.set(ip, live);
    }
    hits = next;
  }

  return {
    check(ip: string): GuardResult {
      const t = now();
      const dayKey = Math.floor(t / DAY_MS);
      if (day.key !== dayKey) day = { key: dayKey, count: 0 };
      if (day.count >= opts.dailyLimit()) {
        return { allowed: false, retryAfterSec: Math.ceil(((dayKey + 1) * DAY_MS - t) / 1000), reason: "daily_cap" };
      }
      const recent = (hits.get(ip) ?? []).filter((x) => t - x < opts.windowMs);
      if (recent.length >= opts.maxPerWindow) {
        hits.set(ip, recent);
        const wait = recent[0] + opts.windowMs - t;
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(wait / 1000)), reason: "ip_window" };
      }
      hits.set(ip, [...recent, t]);
      day = { key: dayKey, count: day.count + 1 };
      prune(t);
      return { allowed: true, retryAfterSec: 0 };
    },
    reset() {
      hits = new Map();
      day = { key: -1, count: 0 };
    },
  };
}

/** Shared guard for every AI route on this instance. */
export const aiGuard: Guard = createGuard({
  windowMs: AI_WINDOW_MS,
  maxPerWindow: AI_MAX_PER_WINDOW,
  dailyLimit: dailyLimitFromEnv,
});

/** Requests on a visitor's own key cost the owner nothing, so they get a looser per-IP limit and no shared daily cap. */
export const VISITOR_MAX_PER_WINDOW = 20;
const VISITOR_DAILY_LIMIT = 5_000;

export const visitorGuard: Guard = createGuard({
  windowMs: AI_WINDOW_MS,
  maxPerWindow: VISITOR_MAX_PER_WINDOW,
  dailyLimit: () => VISITOR_DAILY_LIMIT,
});

/** Client IP from x-forwarded-for (first hop) or x-real-ip; "unknown" when neither is present. */
export function ipFrom(request: Request | Headers): string {
  const headers = request instanceof Headers ? request : request.headers;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/** Convenience for routes: check the shared guard for this request's IP. */
export function guardAiRequest(request: Request, ownKey = false): GuardResult {
  return (ownKey ? visitorGuard : aiGuard).check(ipFrom(request));
}
