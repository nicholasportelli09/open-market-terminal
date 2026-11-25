export type ChartColors = {
  fg: string;
  muted: string;
  faint: string;
  grid: string;
  line: string;
  card: string;
  up: string;
  down: string;
};

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readChartColors(): ChartColors {
  return {
    fg: cssVar("--fg"),
    muted: cssVar("--muted"),
    faint: cssVar("--faint"),
    grid: cssVar("--chart-grid"),
    line: cssVar("--line"),
    card: cssVar("--card"),
    up: cssVar("--up"),
    down: cssVar("--down"),
  };
}

export function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Re-runs `fn` whenever the theme attribute on <html> changes. */
export function onThemeChange(fn: () => void): () => void {
  const obs = new MutationObserver(fn);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
