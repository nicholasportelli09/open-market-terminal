import { expect, test } from "@playwright/test";
import { createGuard, dailyLimitFromEnv, ipFrom } from "@/lib/server/ai/guard";

const MIN = 60_000;

function clock(start = Date.UTC(2026, 10, 21, 12, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("sliding window allows N per window per IP, then reports when the oldest hit expires", () => {
  const c = clock();
  const g = createGuard({ windowMs: 10 * MIN, maxPerWindow: 3, dailyLimit: () => 100, now: c.now });
  expect(g.check("1.1.1.1").allowed).toBe(true);
  c.advance(2 * MIN);
  expect(g.check("1.1.1.1").allowed).toBe(true);
  expect(g.check("1.1.1.1").allowed).toBe(true);
  const blocked = g.check("1.1.1.1");
  expect(blocked).toEqual({ allowed: false, retryAfterSec: 8 * 60, reason: "ip_window" });
  // Another IP is unaffected.
  expect(g.check("2.2.2.2").allowed).toBe(true);
  // Once the first hit slides out of the window, one more is allowed.
  c.advance(8 * MIN);
  expect(g.check("1.1.1.1").allowed).toBe(true);
  expect(g.check("1.1.1.1").allowed).toBe(false);
});

test("blocked requests do not count against the window or the daily cap", () => {
  const c = clock();
  const g = createGuard({ windowMs: MIN, maxPerWindow: 1, dailyLimit: () => 2, now: c.now });
  expect(g.check("a").allowed).toBe(true);
  for (let i = 0; i < 5; i++) expect(g.check("a").allowed).toBe(false);
  expect(g.check("b").allowed).toBe(true);
  expect(g.check("c")).toMatchObject({ allowed: false, reason: "daily_cap" });
});

test("daily cap resets at UTC midnight and reports seconds until then", () => {
  const c = clock(Date.UTC(2026, 10, 21, 23, 0, 0));
  const g = createGuard({ windowMs: MIN, maxPerWindow: 100, dailyLimit: () => 1, now: c.now });
  expect(g.check("a").allowed).toBe(true);
  expect(g.check("b")).toEqual({ allowed: false, retryAfterSec: 3600, reason: "daily_cap" });
  c.advance(3600 * 1000);
  expect(g.check("b").allowed).toBe(true);
});

test("AI_DAILY_LIMIT parsing falls back to 25", () => {
  const prev = process.env.AI_DAILY_LIMIT;
  try {
    delete process.env.AI_DAILY_LIMIT;
    expect(dailyLimitFromEnv()).toBe(25);
    process.env.AI_DAILY_LIMIT = "50";
    expect(dailyLimitFromEnv()).toBe(50);
    process.env.AI_DAILY_LIMIT = "nope";
    expect(dailyLimitFromEnv()).toBe(25);
  } finally {
    if (prev === undefined) delete process.env.AI_DAILY_LIMIT;
    else process.env.AI_DAILY_LIMIT = prev;
  }
});

test("ipFrom reads the first x-forwarded-for hop, then x-real-ip", () => {
  expect(ipFrom(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } }))).toBe("203.0.113.5");
  expect(ipFrom(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  expect(ipFrom(new Headers())).toBe("unknown");
});
