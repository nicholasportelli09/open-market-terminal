import { NextResponse } from "next/server";

const SYMBOL_RE = /^[A-Za-z0-9.@=\-^_]{1,24}$/;
const MAX_SYMBOLS = 120;

export function parseSymbols(param: string | null): string[] | null {
  if (!param) return null;
  const list = param.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0 || list.length > MAX_SYMBOLS) return null;
  return list.every((s) => SYMBOL_RE.test(s)) ? list : null;
}

export function isSymbol(s: string | null): s is string {
  return !!s && SYMBOL_RE.test(s);
}

export function json<T>(data: T, maxAgeSec = 0): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": maxAgeSec ? `public, s-maxage=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 5}` : "no-store" },
  });
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function upstreamFailure(scope: string, err: unknown): NextResponse {
  console.error(`[${scope}]`, err instanceof Error ? err.message : err);
  return fail(502, "Market data source is unavailable. Retrying shortly.");
}
