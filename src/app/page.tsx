import { CalendarPanel } from "@/components/market/calendar-panel";
import { DailyBriefing } from "@/components/market/daily-briefing";
import { MarketOverview } from "@/components/market/market-overview";
import { Movers } from "@/components/market/movers";
import { NewsList } from "@/components/market/news-list";
import { PortfolioGlance } from "@/components/market/portfolio-glance";
import { SectorGrid } from "@/components/market/sector-grid";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { YieldCurve } from "@/components/market/yield-curve";

export default function Home() {
  return (
    <div className="space-y-5">
      <MarketOverview />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <PortfolioGlance />
          <DailyBriefing />
          <SectorGrid />
          <div className="grid gap-5 xl:grid-cols-2">
            <Movers />
            <NewsList limit={9} />
          </div>
          <CalendarPanel />
        </div>
        <aside className="space-y-5">
          <WatchlistPanel />
          <YieldCurve />
        </aside>
      </div>
    </div>
  );
}
