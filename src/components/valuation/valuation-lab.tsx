"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FredRouteSeries } from "@/app/api/fred/route";
import type { CompanySnapshot } from "@/lib/company-types";
import { useApi, type ApiState } from "@/lib/client/use-api";
import { useQuote } from "@/lib/client/quote-store";
import type { Quote } from "@/lib/types";
import { EmptyState, ErrorState, LoadingBlock, UnavailableState } from "@/components/ui/states";
import { TickerPicker } from "./ticker-picker";
import { Workspace } from "./workspace";

const FRED_LOOKBACK_DAYS = 45;

function fredStart(): string {
  return new Date(Date.now() - FRED_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** Valuation Lab container: ticker picker, company snapshot, live quote and the 10-year Treasury yield. */
export function ValuationLab({ symbol, invalid }: { symbol: string | null; invalid: boolean }) {
  const router = useRouter();
  const [start] = useState(fredStart);
  const company = useApi<CompanySnapshot>(symbol ? `/api/company?symbol=${encodeURIComponent(symbol)}` : null);
  const fred = useApi<FredRouteSeries[]>(symbol ? `/api/fred?ids=DGS10&start=${start}` : null);
  const quote = useQuote(company.data?.symbol ?? symbol ?? "");

  useEffect(() => {
    document.title = symbol ? `${symbol} valuation · Terminal` : "Valuation Lab · Terminal";
  }, [symbol]);

  const open = (s: string) => router.push(`/valuation?symbol=${encodeURIComponent(s)}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
            <Link href="/" className="hover:text-fg">Markets</Link>
            <span className="text-faint">/</span>
            <span>Valuation Lab</span>
          </nav>
          <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Valuation Lab</h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">
            A discounted cash flow workspace seeded with SEC filings, live CNBC prices and FRED rates. Every input can be changed; your changes are marked.
          </p>
        </div>
        <TickerPicker onPick={open} />
      </div>
      {invalid && <p className="text-[13px] text-down">That ticker is not valid. Use letters, digits, dots or dashes, e.g. AAPL or BRK.B.</p>}
      {!symbol ? <Intro onPick={open} /> : <Body symbol={symbol} company={company} fred={fred} quote={quote} />}
    </div>
  );
}

function Intro({ onPick }: { onPick: (s: string) => void }) {
  return (
    <section className="rounded-2xl border border-line bg-card">
      <EmptyState
        title="Pick a company to value"
        body="Type a US-listed stock above. The lab loads its SEC-reported revenue, cash flow and balance sheet, and the live price, then lets you build and test a DCF."
        action={
          <button
            type="button"
            onClick={() => onPick("AAPL")}
            className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg"
          >
            Example: open AAPL
          </button>
        }
      />
    </section>
  );
}

type BodyProps = {
  symbol: string;
  company: ApiState<CompanySnapshot>;
  fred: ApiState<FredRouteSeries[]>;
  quote: Quote | undefined;
};

function Body({ symbol, company, fred, quote }: BodyProps) {
  const shell = (node: React.ReactNode) => <section className="rounded-2xl border border-line bg-card">{node}</section>;
  if (company.status === "unavailable" && company.error) return shell(<UnavailableState message={company.error.message} missingEnv={company.error.missingEnv} />);
  if (company.status === "error" && company.error) {
    if (company.error.code === "not_found") {
      return shell(
        <EmptyState
          title={`No SEC fundamentals for ${symbol}`}
          body={`${company.error.message} The lab needs SEC XBRL filings (US filers, 10-K / 10-Q or 20-F). Funds, indices and many foreign listings are not covered.`}
        />,
      );
    }
    return shell(<ErrorState message={company.error.message} onRetry={company.reload} />);
  }
  if (!company.data) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {shell(<LoadingBlock rows={8} />)}
        {shell(<LoadingBlock rows={5} />)}
      </div>
    );
  }
  return <Workspace key={company.data.symbol} snapshot={company.data} quote={quote} fred={fred} />;
}
