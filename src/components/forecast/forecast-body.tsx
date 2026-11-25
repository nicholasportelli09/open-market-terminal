"use client";

import type { AnalystData } from "@/lib/analyst-types";
import type { ApiState } from "@/lib/client/use-api";
import type { Provenance } from "@/lib/provenance";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingBlock, UnavailableState } from "@/components/ui/states";
import { ForecastSummary, providerName } from "./forecast-summary";
import { OurModel } from "./our-model";
import { RatingDistribution } from "./rating-distribution";
import { RatingsHistory } from "./ratings-history";
import { IssueNotes, issuesFor, MissingSection } from "./section-state";
import { TargetPanel } from "./target-panel";

type BodyProps = {
  symbol: string;
  analyst: Pick<ApiState<AnalystData>, "status" | "data" | "error" | "reload">;
  price: number | null;
  priceProvenance: Provenance | null;
  decimals: number;
};

/** Everything below the header on /q/[symbol]/forecast. Presentational: data comes in through props. */
export function ForecastBody({ symbol, analyst, price, priceProvenance, decimals }: BodyProps) {
  const data = analyst.status === "ok" ? analyst.data : null;
  const loading = !data && (analyst.status === "loading" || analyst.status === "idle");
  const failed = !data && !loading;

  const top = data ? (
    <ForecastSummary data={data} price={price} decimals={decimals} />
  ) : failed && analyst.error ? (
    <Panel title="Analyst consensus">
      {analyst.status === "unavailable" ? (
        <UnavailableState message={analyst.error.message} missingEnv={analyst.error.missingEnv} />
      ) : (
        <ErrorState message={analyst.error.message} onRetry={analyst.reload} />
      )}
    </Panel>
  ) : (
    <Panel title="Analyst consensus">
      <LoadingBlock rows={2} />
    </Panel>
  );

  const targetsMissing = data ? (
    <MissingSection data={data} section="targets" emptyTitle="No price targets" emptyBody="FMP has no 12-month price targets for this symbol." />
  ) : (
    <EmptyState title="No price targets" body={analyst.status === "unavailable" ? "Analyst targets appear here once FMP_API_KEY is set." : "Analyst data could not be loaded."} />
  );

  const distTitle = `Rating distribution · ${providerName(data?.distribution?.provenance)}`;
  const histTitle = `Ratings history · ${providerName(data?.history?.provenance)}`;

  return (
    <div className="space-y-5">
      {top}
      <TargetPanel
        symbol={symbol}
        title={`Price target · Analyst consensus (${providerName(data?.targets?.provenance)})`}
        targets={data ? data.targets ?? null : loading ? undefined : null}
        missing={targetsMissing}
        livePrice={price}
        priceProvenance={priceProvenance}
        decimals={decimals}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={distTitle}>
          {data?.distribution ? (
            <>
              <RatingDistribution d={data.distribution} />
              <IssueNotes issues={issuesFor(data, "distribution")} className="px-4 pb-3" />
            </>
          ) : data ? (
            <MissingSection data={data} section={issuesFor(data, "distribution").length ? "distribution" : "consensus"} emptyTitle="No ratings on record" />
          ) : loading ? (
            <LoadingBlock rows={4} />
          ) : (
            <EmptyState title="Unavailable" body="Needs analyst data (see above)." />
          )}
        </Panel>
        <OurModel symbol={symbol} price={price} decimals={decimals} />
      </div>
      <Panel title={histTitle}>
        {data?.history ? (
          <>
            <IssueNotes issues={issuesFor(data, "history")} className="border-b border-line px-4 py-2" />
            <RatingsHistory history={data.history} price={price} decimals={decimals} />
          </>
        ) : data ? (
          <MissingSection data={data} section="history" emptyTitle="No analyst actions on record" />
        ) : loading ? (
          <LoadingBlock rows={6} />
        ) : (
          <EmptyState title="Unavailable" body="Needs analyst data (see above)." />
        )}
      </Panel>
    </div>
  );
}
