import { LineSeries, LineStyle, type IChartApi, type ISeriesApi, type LineData, type SeriesType } from "lightweight-charts";
import type { Bar } from "@/lib/types";
import { asTime } from "./chart-series";
import { withAlpha } from "./chart-theme";

export const INDICATORS = [
  { id: "sma20", label: "SMA 20", hint: "20-bar simple moving average" },
  { id: "sma50", label: "SMA 50", hint: "50-bar simple moving average" },
  { id: "sma200", label: "SMA 200", hint: "200-bar simple moving average" },
  { id: "ema20", label: "EMA 20", hint: "20-bar exponential moving average" },
  { id: "bb", label: "Bollinger", hint: "Bollinger bands (20 bars, 2 standard deviations)" },
  { id: "rsi", label: "RSI 14", hint: "Relative strength index in its own pane (overbought above 70, oversold below 30)" },
] as const;
export type IndicatorId = (typeof INDICATORS)[number]["id"];

/** Fixed hues that read on both themes and stay clear of the up/down candle colours. */
export const INDICATOR_COLORS: Record<IndicatorId, string> = {
  sma20: "#2563eb",
  sma50: "#d97706",
  sma200: "#9333ea",
  ema20: "#0891b2",
  bb: "#64748b",
  rsi: "#7c3aed",
};

const RSI_PANE_HEIGHT = 96;
const RSI_PERIOD = 14;
const BB_PERIOD = 20;
const BB_WIDTH = 2;

type Line = (number | null)[];

function sma(values: number[], n: number): Line {
  const out: Line = [];
  let sum = 0;
  values.forEach((v, i) => {
    sum += v;
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  });
  return out;
}

function ema(values: number[], n: number): Line {
  const k = 2 / (n + 1);
  const out: Line = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < n - 1) return out.push(null);
    prev = prev == null ? values.slice(0, n).reduce((a, b) => a + b, 0) / n : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

function bollinger(values: number[]): [Line, Line] {
  const mid = sma(values, BB_PERIOD);
  const upper: Line = [];
  const lower: Line = [];
  mid.forEach((m, i) => {
    if (m == null) return upper.push(null), lower.push(null);
    const window = values.slice(i - BB_PERIOD + 1, i + 1);
    const sd = Math.sqrt(window.reduce((a, v) => a + (v - m) ** 2, 0) / BB_PERIOD);
    upper.push(m + BB_WIDTH * sd);
    lower.push(m - BB_WIDTH * sd);
  });
  return [upper, lower];
}

/** Wilder's RSI. */
function rsi(values: number[]): Line {
  const out: Line = [null];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= RSI_PERIOD) {
      gain += g / RSI_PERIOD;
      loss += l / RSI_PERIOD;
    } else {
      gain = (gain * (RSI_PERIOD - 1) + g) / RSI_PERIOD;
      loss = (loss * (RSI_PERIOD - 1) + l) / RSI_PERIOD;
    }
    out.push(i < RSI_PERIOD ? null : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

/** The lines one indicator draws (Bollinger draws two). */
function linesFor(id: IndicatorId, closes: number[]): Line[] {
  switch (id) {
    case "sma20":
      return [sma(closes, 20)];
    case "sma50":
      return [sma(closes, 50)];
    case "sma200":
      return [sma(closes, 200)];
    case "ema20":
      return [ema(closes, 20)];
    case "bb":
      return bollinger(closes);
    case "rsi":
      return [rsi(closes)];
  }
}

function toData(bars: Bar[], line: Line): LineData[] {
  const out: LineData[] = [];
  line.forEach((v, i) => v != null && out.push({ time: asTime(bars[i].t), value: v }));
  return out;
}

export type IndicatorHandle = { id: IndicatorId; series: ISeriesApi<SeriesType>[] };

/** Adds the selected indicators to the chart. RSI gets its own pane under the price. */
export function addIndicators(chart: IChartApi, ids: readonly IndicatorId[], bars: Bar[]): IndicatorHandle[] {
  const closes = bars.map((b) => b.c);
  return ids.map((id) => {
    const color = INDICATOR_COLORS[id];
    const pane = id === "rsi" ? 1 : 0;
    const series = linesFor(id, closes).map((line) => {
      const s = chart.addSeries(
        LineSeries,
        {
          color: id === "bb" ? withAlpha(color, 0.75) : color,
          lineWidth: id === "rsi" ? 2 : 1,
          lineStyle: id === "bb" ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: id === "rsi",
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: id === "rsi" ? () => ({ priceRange: { minValue: 0, maxValue: 100 } }) : undefined,
        },
        pane,
      );
      s.setData(toData(bars, line));
      return s;
    });
    if (id === "rsi") {
      for (const level of [30, 70]) series[0].createPriceLine({ price: level, color: withAlpha(color, 0.45), lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" });
      chart.panes()[1]?.setHeight(RSI_PANE_HEIGHT);
    }
    return { id, series };
  });
}

export function removeIndicators(chart: IChartApi, handles: IndicatorHandle[]): void {
  for (const h of handles) for (const s of h.series) chart.removeSeries(s);
  while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
}

/** Refreshes the newest point of each indicator after a live tick. */
export function updateIndicators(handles: IndicatorHandle[], bars: Bar[]): void {
  const last = bars[bars.length - 1];
  if (!last) return;
  const closes = bars.map((b) => b.c);
  for (const h of handles) {
    linesFor(h.id, closes).forEach((line, i) => {
      const v = line[line.length - 1];
      if (v == null) return;
      try {
        h.series[i].update({ time: asTime(last.t), value: v });
      } catch {
        /* a bar inside the 1D padding: the next rebuild draws it */
      }
    });
  }
}
