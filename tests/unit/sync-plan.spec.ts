import { expect, test } from "@playwright/test";
import { allowedUserIds, bearerToken, requireAiUser } from "@/lib/server/auth";
import { MAX_VALUE_CHARS, type SyncMeta, hashValue, parseMeta, planSync } from "@/lib/sync/plan";

const U = "user-1";
const P = "terminal.portfolio.v1";
const W = "terminal.watchlist.v1";

const meta = (keys: SyncMeta["keys"], userId = U): SyncMeta => ({ userId, keys });

test("first sign-in on a device: local-only data uploads, account-only data downloads", () => {
  const plan = planSync({ [P]: "local-portfolio" }, { [W]: { value: '["AAPL"]', updatedAt: "t1" } }, null, U);
  expect(plan.upload).toEqual([{ key: P, value: "local-portfolio" }]);
  expect(plan.download).toEqual([{ key: W, value: '["AAPL"]', remoteAt: "t1", backup: null }]);
});

test("equal values only record the sync; unchanged records do nothing", () => {
  const first = planSync({ [P]: "x" }, { [P]: { value: "x", updatedAt: "t1" } }, null, U);
  expect(first.settled).toEqual([{ key: P, hash: hashValue("x"), remoteAt: "t1" }]);
  expect(first.upload).toEqual([]);
  expect(first.download).toEqual([]);
  const again = planSync({ [P]: "x" }, { [P]: { value: "x", updatedAt: "t1" } }, meta({ [P]: { hash: hashValue("x"), remoteAt: "t1" } }), U);
  expect(again).toEqual({ download: [], upload: [], settled: [], tooLarge: [], stash: [], otherAccount: false });
});

test("only this device changed -> upload; only the account changed -> download", () => {
  const m = meta({ [P]: { hash: hashValue("old"), remoteAt: "t1" } });
  expect(planSync({ [P]: "new" }, { [P]: { value: "old", updatedAt: "t1" } }, m, U).upload).toEqual([{ key: P, value: "new" }]);
  const d = planSync({ [P]: "old" }, { [P]: { value: "theirs", updatedAt: "t2" } }, m, U);
  expect(d.download).toEqual([{ key: P, value: "theirs", remoteAt: "t2", backup: null }]);
  expect(d.upload).toEqual([]);
});

test("both changed, or never synced here and different: the account copy wins and this device's copy is kept as a backup", () => {
  const m = meta({ [P]: { hash: hashValue("old"), remoteAt: "t1" } });
  expect(planSync({ [P]: "mine" }, { [P]: { value: "theirs", updatedAt: "t2" } }, m, U).download).toEqual([
    { key: P, value: "theirs", remoteAt: "t2", backup: "mine" },
  ]);
  expect(planSync({ [P]: "mine" }, { [P]: { value: "theirs", updatedAt: "t2" } }, null, U).download[0].backup).toBe("mine");
});

test("data last synced with another account is never uploaded: it is moved aside or backed up", () => {
  const other = meta({ [P]: { hash: hashValue("mine"), remoteAt: "t1" }, [W]: { hash: hashValue("w"), remoteAt: "t1" } }, "someone-else");
  const plan = planSync({ [P]: "mine", [W]: "w" }, { [P]: { value: "theirs", updatedAt: "t1" } }, other, U);
  expect(plan.otherAccount).toBe(true);
  expect(plan.upload).toEqual([]);
  expect(plan.download).toEqual([{ key: P, value: "theirs", remoteAt: "t1", backup: "mine" }]);
  expect(plan.stash).toEqual([{ key: W, value: "w" }]);
});

test("a device never synced before (no record) uploads its data: that is the first sign-in", () => {
  const plan = planSync({ [W]: "w" }, {}, null, U);
  expect(plan.otherAccount).toBe(false);
  expect(plan.upload).toEqual([{ key: W, value: "w" }]);
  expect(plan.stash).toEqual([]);
});

test("values over the database limit are flagged, not uploaded", () => {
  const big = "x".repeat(MAX_VALUE_CHARS + 1);
  const plan = planSync({ [P]: big }, {}, null, U);
  expect(plan.upload).toEqual([]);
  expect(plan.tooLarge).toEqual([P]);
});

test("sync meta parsing drops unknown keys and bad shapes", () => {
  expect(parseMeta(null)).toBeNull();
  expect(parseMeta("not json")).toBeNull();
  expect(parseMeta('{"keys":{}}')).toBeNull();
  const raw = JSON.stringify({ userId: U, keys: { [P]: { hash: "h", remoteAt: "t" }, "terminal.other": { hash: "h", remoteAt: "t" }, [W]: { hash: 1 } } });
  expect(parseMeta(raw)).toEqual({ userId: U, keys: { [P]: { hash: "h", remoteAt: "t" } } });
});

test("AI sign-in check: bearer parsing, owner allowlist, open when Supabase is not configured", async () => {
  const req = (auth?: string) => new Request("http://x/api/research", { method: "POST", headers: auth ? { authorization: auth } : {} });
  expect(bearerToken(req("Bearer abcdefghijklmnopqrstuvwxyz"))).toBe("abcdefghijklmnopqrstuvwxyz");
  expect(bearerToken(req("Bearer short"))).toBeNull();
  expect(bearerToken(req("Basic abcdefghijklmnopqrstuvwxyz"))).toBeNull();
  expect(bearerToken(req())).toBeNull();
  expect([...allowedUserIds(" A-1 , b-2,, ")]).toEqual(["a-1", "b-2"]);
  expect(allowedUserIds(undefined).size).toBe(0);
  // The unit-test environment has no NEXT_PUBLIC_SUPABASE_* values, so the gate is open (local development).
  expect(await requireAiUser(req())).toBeNull();
});
