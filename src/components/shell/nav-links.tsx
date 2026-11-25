"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const NAV_ITEMS = [
  { href: "/", label: "Markets" },
  { href: "/scanner", label: "Scanner" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/research", label: "Research" },
  { href: "/valuation", label: "Valuation" },
  { href: "/macro", label: "Macro" },
] as const;

/** Quote pages (/q/*) belong to Markets. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/q/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

const EDGE_PX = 4;

/** Fades the right edge while more links are hidden off-screen (phones). */
function useOverflowFade() {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setFade(el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_PX);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return { ref, fade };
}

/** Main navigation. `inline` sits in the header row; `row` is the scrollable second row on smaller screens. */
export function NavLinks({ layout }: { layout: "inline" | "row" }) {
  const pathname = usePathname() ?? "/";
  const { ref, fade } = useOverflowFade();
  const row = layout === "row";
  return (
    <nav aria-label={row ? "Main (compact)" : "Main"} className={row ? "min-w-0 flex-1" : "shrink-0"}>
      <div
        ref={ref}
        className={`no-scrollbar flex items-center gap-0.5 ${row ? "-mx-2 overflow-x-auto px-2" : ""}`}
        style={row && fade ? { maskImage: "linear-gradient(to right, #000 85%, transparent)", WebkitMaskImage: "linear-gradient(to right, #000 85%, transparent)" } : undefined}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-[13.5px] font-medium transition-colors ${
                active ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
