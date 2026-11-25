import Link from "next/link";
import { AnalystButton } from "@/components/research/analyst-button";
import { AccountMenu } from "./account-menu";
import { CommandSearch } from "./command-search";
import { MarketStatus } from "./market-status";
import { NavLinks } from "./nav-links";
import { PrefsToggles } from "./prefs-toggles";

export function TopBar() {
  return (
    <header className="site-header sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Terminal home">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="14" fill="var(--fg)" />
            <path d="M20 14v36M32 20v30M44 12v32" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            <rect x="15" y="24" width="10" height="16" rx="2" fill="var(--accent)" />
            <rect x="27" y="28" width="10" height="12" rx="2" fill="var(--bg)" />
            <rect x="39" y="18" width="10" height="16" rx="2" fill="var(--accent)" />
          </svg>
          <span className="hidden text-[16px] font-semibold tracking-tight sm:block">Terminal</span>
        </Link>
        <div className="hidden xl:block">
          <NavLinks layout="inline" />
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <CommandSearch />
        </div>
        <MarketStatus className="hidden lg:flex" />
        <AnalystButton />
        <AccountMenu />
        <PrefsToggles />
      </div>
      <div className="mx-auto flex h-11 w-full max-w-[1440px] items-center gap-4 border-t border-line px-4 sm:px-6 lg:px-8 xl:hidden">
        <NavLinks layout="row" />
        <MarketStatus variant="compact" className="hidden shrink-0 sm:flex lg:hidden" />
      </div>
    </header>
  );
}
