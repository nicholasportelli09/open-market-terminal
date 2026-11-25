"use client";

import { useOwnAiKey } from "@/lib/client/ai-key";
import { AiKeyPrompt } from "@/components/shell/ai-key-prompt";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ApiError } from "@/lib/api-types";
import { fmtDateKey, fmtNyStamp, fmtNyTime } from "@/lib/format";
import type { Provenance } from "@/lib/provenance";
import type { Briefing, PortfolioSummary } from "@/lib/server/research/types";
import { Panel } from "@/components/ui/panel";
import { SourceTags } from "@/components/ui/source-tag";
import { ErrorState } from "@/components/ui/states";
import { AI_FOOTER } from "@/components/research/answer-view";
import { KindChip, RefMarkers, hostOf } from "@/components/research/claim-parts";
import { PortfolioToggle } from "@/components/research/portfolio-toggle";
import { postJson } from "@/components/research/use-research";
import { useAuth } from "@/lib/client/auth";

type Req = { portfolio?: PortfolioSummary; refresh: boolean; n: number };
type State =
  | { status: "loading" }
  | { status: "ok"; data: Briefing; sources: Provenance[]; refreshing: boolean; refreshError: string | null }
  | { status: "unavailable" | "error" | "signin"; error: ApiError };

function updatedLabel(iso: string): string {
  const at = new Date(iso);
  const sameDay = new Date().toDateString() === at.toDateString();
  return `Updated ${sameDay ? fmtNyTime(at) : fmtNyStamp(at)}`;
}

/** Homepage daily briefing: about 100 words written by AI from quotes, headlines and the calendar (plus web search when the provider has it). */
export function DailyBriefing() {
  const [req, setReq] = useState<Req>({ refresh: false, n: 0 });
  const [state, setState] = useState<State>({ status: "loading" });
  const [includePortfolio, setIncludePortfolio] = useState(false);
  const latest = useRef<PortfolioSummary | null>(null);
  const auth = useAuth();
  // Wait for the sign-in check, and fetch again when the signed-in account changes (the AI routes need a sign-in).
  // A visitor's own AI key also changes who pays, so saving or removing one fetches again too.
  const ownKey = useOwnAiKey();
  const who = auth.status === "loading" ? "loading" : `${auth.status === "signed-in" ? auth.userId : auth.status}:${ownKey ? ownKey.provider + ownKey.key.slice(-4) : "server"}`;
  const signedIn = useRef(false);
  signedIn.current = auth.status === "signed-in";
  const hasOwnKey = useRef(false);
  hasOwnKey.current = ownKey !== null;

  useEffect(() => {
    if (who === "loading") return;
    const c = new AbortController();
    setState((s) => (s.status === "ok" ? { ...s, refreshing: true, refreshError: null } : { status: "loading" }));
    postJson<Briefing>("/api/briefing", { ...(req.portfolio ? { portfolio: req.portfolio } : {}), refresh: req.refresh }, c.signal)
      .then((r) => {
        if (r.ok) return setState({ status: "ok", data: r.data, sources: r.sources, refreshing: false, refreshError: null });
        setState((s) =>
          s.status === "ok"
            ? { ...s, refreshing: false, refreshError: r.message }
            : { status: r.code === "not_configured" ? "unavailable" : r.code === "unauthorized" && who !== "loading" && (!signedIn.current || !hasOwnKey.current) ? "signin" : "error", error: r },
        );
      })
      .catch(() => undefined); // aborted
    return () => c.abort();
  }, [req, who]);

  // A portfolio summary is captured once when the switch is turned on (prices keep moving; we do not resend on every tick).
  const onSummary = useCallback(
    (s: PortfolioSummary | null) => {
      latest.current = s;
      if (s && includePortfolio) setReq((r) => (r.portfolio ? r : { portfolio: s, refresh: false, n: r.n + 1 }));
    },
    [includePortfolio],
  );
  const onToggle = (on: boolean) => {
    setIncludePortfolio(on);
    if (!on) setReq((r) => ({ refresh: false, n: r.n + 1 }));
  };
  const refresh = () => setReq((r) => ({ portfolio: includePortfolio ? latest.current ?? r.portfolio : undefined, refresh: true, n: r.n + 1 }));

  const busy = state.status === "loading" || (state.status === "ok" && state.refreshing);
  const action =
    state.status === "ok" ? (
      <div className="flex items-center gap-2.5">
        <span className="hidden text-[12px] text-faint sm:inline">{updatedLabel(state.data.generatedAt)}</span>
        <button type="button" onClick={refresh} disabled={busy} className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg disabled:cursor-wait disabled:opacity-60">
          {busy ? "Refreshing" : "Refresh"}
        </button>
      </div>
    ) : undefined;

  return (
    <Panel title="Daily briefing" action={action} bodyClassName="px-4 py-4">
      {state.status === "loading" && <Loading />}
      {state.status === "unavailable" && <AiKeyPrompt />}
      {state.status === "signin" && (
        <>
          {!/own/i.test(state.error.message) && <p className="text-center text-[13px] text-muted">{state.error.message}</p>}
          <AiKeyPrompt />
        </>
      )}
      {state.status === "error" && <ErrorState message={state.error.message} onRetry={() => setReq((r) => ({ ...r, refresh: false, n: r.n + 1 }))} />}
      {state.status === "ok" && <BriefingBody data={state.data} sources={state.sources} refreshError={state.refreshError} />}
      {state.status !== "unavailable" && state.status !== "signin" && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-muted hover:text-fg">Personalize with my portfolio exposures</summary>
          <div className="mt-2.5">
            <PortfolioToggle compact on={includePortfolio} onToggle={onToggle} onSummary={onSummary} />
          </div>
        </details>
      )}
    </Panel>
  );
}

function Loading() {
  return (
    <div className="space-y-2.5" role="status" aria-live="polite">
      <p className="text-[13px] text-muted">Writing today&apos;s briefing from quotes, headlines and the economic calendar. This can take up to a minute.</p>
      {[94, 86, 90, 70].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}
    </div>
  );
}

function BriefingBody({ data, sources, refreshError }: { data: Briefing; sources: Provenance[]; refreshError: string | null }) {
  const uid = useId().replace(/:/g, "");
  const anchor = (id: string) => `brief-${uid}-${id}`;
  const a = data.answer;
  const web = a.citations.filter((c) => c.kind === "web" && c.url);
  const dataDocs = a.citations.filter((c) => c.kind === "data");
  const notesRef = useRef<HTMLDetailsElement>(null);
  // A source chip (S1, S2...) opens the collapsed sources list so its target is visible before the jump.
  const openNotesForChip = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a");
    if (link?.getAttribute("href")?.startsWith("#brief-") && notesRef.current) notesRef.current.open = true;
  };
  return (
    <div className="space-y-3.5" onClickCapture={openNotesForChip}>
      <p className="text-[12px] text-faint">
        {data.sessionNote.includes(fmtDateKey(data.marketDate)) ? "" : `Covers ${fmtDateKey(data.marketDate, true)}. `}
        {data.sessionNote}
        <span className="sm:hidden"> {updatedLabel(data.generatedAt)}.</span>
      </p>
      {refreshError && <p className="text-[12px] text-down">Refresh failed: {refreshError} Showing the previous briefing.</p>}
      <div className="space-y-3">
        {a.sections.map((s, i) => (
          <section key={i}>
            {s.heading && <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{s.heading}</h3>}
            <ul className="space-y-1.5">
              {s.claims.map((c, j) => (
                <li key={j} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                  <KindChip kind={c.kind} />
                  <p className={`min-w-0 flex-1 text-[14px] leading-relaxed ${c.kind === "interpretation" ? "text-muted" : ""}`}>
                    {c.text}
                    <RefMarkers refs={c.refs} anchor={anchor} />
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <details ref={notesRef} className="border-t border-line pt-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-muted hover:text-fg">
          Sources and notes<span className="font-normal text-faint"> · {a.model}{data.fromCache ? " · cached" : ""}</span>
        </summary>
        <div className="mt-2.5 space-y-3">
          {a.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-muted">{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          {(web.length > 0 || dataDocs.length > 0) && (
            <ol className="space-y-1 text-[12px]">
              {[...dataDocs, ...web].map((c) => (
                <li key={c.id} id={anchor(c.id)} className="flex scroll-mt-24 gap-2">
                  <span className="num w-7 shrink-0 font-semibold text-faint">{c.id}</span>
                  {c.kind === "web" ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words hover:underline">
                      {c.title} <span className="text-faint">· {hostOf(c.url)}</span>
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 break-words text-muted">{c.title}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <SourceTags list={sources} />
          <p className="text-[11.5px] text-faint">
            {AI_FOOTER} {a.model} · {data.wordCount} words{data.fromCache ? " · cached" : ""}. Calendar data is from Nasdaq.com (unofficial).
          </p>
        </div>
      </details>
    </div>
  );
}
