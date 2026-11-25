import { REPO_URL } from "@/lib/site";

/** Open-source note and disclaimers, under every page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 py-5 text-[12px] text-faint sm:px-6 lg:px-8">
        <p>
          Open-source, AI-powered market terminal ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
            Source on GitHub
          </a>{" "}
          · MIT licence
        </p>
        <p>
          Charts by{" "}
          <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
            TradingView Lightweight Charts™
          </a>
          , Copyright (c) 2025 TradingView, Inc. (Apache 2.0)
        </p>
        <p>Data can be delayed. Not investment advice. Not affiliated with Bloomberg L.P.</p>
      </div>
    </footer>
  );
}
