import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LastPriceAnimationMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "@/lib/types";
import { type ChartColors, withAlpha } from "./chart-theme";

export function asTime(t: number): Time {
  return t as UTCTimestamp;
}

type BuildArgs = {
  chart: IChartApi;
  mode: "line" | "candles";
  bars: Bar[];
  pad: { time: Time }[];
  colors: ChartColors;
  /** Line colour follows direction vs this value (previous close on 1D, range start otherwise). */
  baseline: number | null;
  prevCloseLine: number | null;
  pulse: boolean;
};

/** Creates the series for a mode and loads the data. The first returned series is the main one. */
export function buildSeries({ chart, mode, bars, pad, colors: c, baseline, prevCloseLine, pulse }: BuildArgs): ISeriesApi<SeriesType>[] {
  const last = bars[bars.length - 1]?.c;
  const color = baseline == null || last == null || last >= baseline ? c.up : c.down;

  if (mode === "line") {
    const area = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: withAlpha(color, 0.16),
      bottomColor: withAlpha(color, 0),
      priceLineVisible: false,
      lastValueVisible: false,
      lastPriceAnimation: pulse ? LastPriceAnimationMode.Continuous : LastPriceAnimationMode.Disabled,
      crosshairMarkerRadius: 4.5,
      crosshairMarkerBorderColor: c.card,
    });
    area.setData([...bars.map((b) => ({ time: asTime(b.t), value: b.c })), ...pad]);
    if (prevCloseLine != null) {
      area.createPriceLine({ price: prevCloseLine, color: c.faint, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "Prev close" });
    }
    return [area];
  }

  const candles = chart.addSeries(CandlestickSeries, {
    upColor: c.up,
    downColor: c.down,
    wickUpColor: c.up,
    wickDownColor: c.down,
    borderVisible: false,
    priceLineVisible: true,
    priceLineStyle: LineStyle.Dotted,
    priceLineWidth: 1,
  });
  candles.setData([...bars.map((b) => ({ time: asTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })), ...pad]);
  const out: ISeriesApi<SeriesType>[] = [candles];
  if (bars.some((b) => b.v > 0)) {
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: asTime(b.t), value: b.v, color: withAlpha(b.c >= b.o ? c.up : c.down, 0.28) })));
    out.push(vol);
  }
  return out;
}
