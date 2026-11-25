import Link from "next/link";

export type InstrumentTab = "overview" | "forecast";

type Item = { id: InstrumentTab | "valuation" | "research"; label: string; href: string; stockOnly: boolean };

function items(symbol: string): Item[] {
  const s = encodeURIComponent(symbol);
  return [
    { id: "overview", label: "Overview", href: `/q/${s}`, stockOnly: false },
    { id: "forecast", label: "Forecast", href: `/q/${s}/forecast`, stockOnly: true },
    { id: "valuation", label: "Valuation", href: `/valuation?symbol=${s}`, stockOnly: true },
    { id: "research", label: "Ask analyst", href: `/research?symbol=${s}&mode=analyze`, stockOnly: false },
  ];
}

type InstrumentNavProps = { symbol: string; active: InstrumentTab; isStock: boolean };

/** Compact sub-navigation for one instrument: Overview, Forecast, Valuation (stocks), Ask analyst. */
export function InstrumentNav({ symbol, active, isStock }: InstrumentNavProps) {
  const list = items(symbol).filter((i) => isStock || !i.stockOnly || i.id === active);
  return (
    <nav aria-label="Instrument sections" className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto border-b border-line px-1">
      {list.map((i) => {
        const current = i.id === active;
        return (
          <Link
            key={i.id}
            href={i.href}
            aria-current={current ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
              current ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
