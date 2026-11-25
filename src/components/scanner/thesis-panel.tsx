"use client";

import { AiKeyPrompt } from "@/components/shell/ai-key-prompt";
import { useOwnAiKey } from "@/lib/client/ai-key";
import { useEffect, useRef, useState } from "react";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import type { ApiError } from "@/lib/api-types";
import { postApi, useApi } from "@/lib/client/use-api";
import type { ThesisResult } from "@/lib/scanner/thesis";
import { ThesisView } from "./thesis-view";

type Status = { providers: { ai: boolean } };

type ThesisPanelProps = { symbol: string; thesis: ThesisResult | null; onGenerated: (t: ThesisResult) => void };

type Run = { state: "idle" } | { state: "running"; startedAt: number } | { state: "failed"; error: ApiError };

const btn = "inline-flex h-8 cursor-pointer items-center rounded-lg border border-line-strong bg-fg px-3 text-[12.5px] font-medium text-bg hover:opacity-90 disabled:cursor-default disabled:opacity-50";

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="num">{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

/** "Generate thesis" (needs the AI provider key on the server) and the generated or reopened thesis. */
export function ThesisPanel({ symbol, thesis, onGenerated }: ThesisPanelProps) {
  const status = useApi<Status>("/api/status");
  const ownKey = useOwnAiKey();
  const [run, setRun] = useState<Run>({ state: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const generate = async () => {
    setRun({ state: "running", startedAt: Date.now() });
    const r = await postApi<ThesisResult>("/api/scanner/thesis", { symbol }, { auth: true });
    // A finished thesis is saved even if the panel was closed meanwhile.
    if (r.ok) onGenerated(r.data);
    if (!alive.current) return;
    setRun(r.ok ? { state: "idle" } : { state: "failed", error: r });
  };

  // A visitor's own key works even when the server has no AI key of its own.
  const configured = ownKey !== null ? true : status.data?.providers.ai;
  const notConfigured = configured === false || (run.state === "failed" && run.error.code === "not_configured");
  const needsKey = run.state === "failed" && run.error.code === "unauthorized";

  return (
    <section aria-labelledby="th-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="th-title" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">AI thesis</h3>
        {configured && run.state !== "running" && (
          <button type="button" className={btn} onClick={generate}>
            {thesis ? "Generate again" : "Generate thesis"}
          </button>
        )}
      </div>
      {status.status === "loading" && <LoadingBlock rows={1} className="px-0" />}
      {status.status === "error" && <ErrorState message="Could not check whether AI is configured." onRetry={status.reload} />}
      {notConfigured && (
        <div className="rounded-xl border border-line">
          <AiKeyPrompt />
        </div>
      )}
      {configured && !thesis && run.state === "idle" && (
        <p className="text-[12.5px] text-muted">
          The AI analyses {symbol} from the sourced data above, then writes evidence for and against, dated catalysts and
          key risks, and proposes bear, base and bull DCF assumptions that this app values. Takes one to two minutes.
        </p>
      )}
      {run.state === "running" && (
        <div role="status" aria-live="polite" className="rounded-xl border border-line px-3 py-3">
          <p className="text-[13px] font-medium">Researching {symbol}... <Elapsed since={run.startedAt} /></p>
          <p className="mt-0.5 text-[12px] text-muted">Writing the thesis, then valuing three scenarios. Keep this panel open.</p>
          <LoadingBlock rows={3} className="px-0" />
        </div>
      )}
      {needsKey && (
        <div className="rounded-xl border border-line">
          <AiKeyPrompt />
        </div>
      )}
      {run.state === "failed" && run.error.code !== "not_configured" && !needsKey && (
        <div className="rounded-xl border border-line">
          <ErrorState message={run.error.message} onRetry={generate} />
        </div>
      )}
      {thesis && run.state !== "running" && <ThesisView thesis={thesis} />}
    </section>
  );
}
