import { fmtCompact, fmtPrice } from "@/lib/format";
import type { Quote } from "@/lib/types";

type Stat = { label: string; value: string };

function rangeBar(q: Quote) {
  const lo = Number(q.fundamentals.yrloprice?.replace(/,/g, ""));
  const hi = Number(q.fundamentals.yrhiprice?.replace(/,/g, ""));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo || q.last == null) return null;
  const pos = Math.min(Math.max((q.last - lo) / (hi - lo), 0), 1) * 100;
  return { lo, hi, pos };
}

function collect(q: Quote): Stat[] {
  const f = q.fundamentals;
  const e = q.events;
  const p = (n: number | null) => fmtPrice(n, q.decimals, q.isYield);
  const stats: (Stat | false)[] = [
    { label: "Open", value: p(q.open) },
    { label: "Day high", value: p(q.high) },
    { label: "Day low", value: p(q.low) },
    { label: "Prev close", value: p(q.prevClose) },
    !!q.volume && { label: "Volume", value: fmtCompact(q.volume) },
    !!f.tendayavgvol && { label: "Avg vol (10d)", value: f.tendayavgvol },
    !!f.mktcapView && { label: "Market cap", value: f.mktcapView },
    !!f.pe && { label: "P/E", value: f.pe },
    !!f.fpe && { label: "Forward P/E", value: f.fpe },
    !!f.eps && { label: "EPS (TTM)", value: f.eps },
    !!f.dividendyield && { label: "Dividend yield", value: f.dividendyield },
    !!f.beta && { label: "Beta", value: f.beta },
    !!f.revenuettm && { label: "Revenue (TTM)", value: f.revenuettm },
    !!f.NETPROFTTM && { label: "Net margin", value: f.NETPROFTTM },
    !!f.GROSMGNTTM && { label: "Gross margin", value: f.GROSMGNTTM },
    !!f.ROETTM && { label: "ROE", value: f.ROETTM },
    !!f.DEBTEQTYQ && { label: "Debt / equity", value: f.DEBTEQTYQ },
    !!f.sharesout && { label: "Shares out", value: f.sharesout },
    !!e.next_earnings_date && { label: "Next earnings", value: e.next_earnings_date.replace("(est)", " (est.)") },
    !!e.div_ex_date && { label: "Ex-dividend", value: e.div_ex_date },
  ];
  return stats.filter((s): s is Stat => !!s && s.value !== "—");
}

export function KeyStats({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  const stats = collect(quote);
  const range = rangeBar(quote);
  return (
    <section className="rounded-2xl border border-line bg-card" aria-labelledby="stats-heading">
      <header className="flex min-h-12 items-center border-b border-line px-4">
        <h2 id="stats-heading" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Key stats</h2>
      </header>
      {range && (
        <div className="border-b border-line px-4 py-3.5">
          <div className="mb-2 flex justify-between text-[12px] text-faint">
            <span>52-week low</span>
            <span>52-week high</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-hover">
            <div className="absolute inset-y-0 left-0 rounded-full bg-line-strong" style={{ width: `${range.pos}%` }} />
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-fg" style={{ left: `${range.pos}%` }} />
          </div>
          <div className="num mt-2 flex justify-between text-[13px]">
            <span>{fmtPrice(range.lo, quote.decimals)}</span>
            <span>{fmtPrice(range.hi, quote.decimals)}</span>
          </div>
        </div>
      )}
      <dl className={compact ? "grid grid-cols-2 lg:grid-cols-1" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}>
        {stats.map((s) => (
          <div
            key={s.label}
            className={`flex items-baseline justify-between gap-3 border-b border-line px-4 last:border-b-0 ${compact ? "py-2" : "py-2.5 sm:border-r"}`}
          >
            <dt className="text-[12.5px] text-muted">{s.label}</dt>
            <dd className="num text-right text-[13.5px] font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
