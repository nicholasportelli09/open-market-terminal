"use client";

import {
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  TrackingModeExitMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetch } from "@/lib/client/use-fetch";
import { presetBars } from "@/lib/chart-shared";
import { fmtPct, fmtPrice, fmtSigned } from "@/lib/format";
import { RANGES, type Bar, type ChartPayload, type Quote, type Range } from "@/lib/types";
import { Segmented } from "@/components/ui/panel";
import { applyTick, firstBarOfEachDay, formatTick, rangeLabel, wallClockSeconds, whitespaceUntil, withLiveBar } from "./chart-data";
import { INTERVAL_SECONDS, RANGE_INTERVALS, aggregateTo, indexContaining, isIntraday, resolveInterval, type Interval } from "./chart-intervals";
import { ChartControls } from "./chart-controls";
import { INDICATORS, addIndicators, removeIndicators, updateIndicators, type IndicatorHandle, type IndicatorId } from "./chart-indicators";
import { ChartLegend, type HoverInfo } from "./chart-legend";
import { IndicatorMenu } from "./indicator-menu";
import { followLatest, indexShift, isAwayFromLatest, panRange, presetRange, readRange, realtimeRange, setRange, zoomAt, type ViewLayout } from "./chart-nav";
import { ChartMeasureOverlay } from "./chart-measure-overlay";
import { asTime, buildSeries } from "./chart-series";
import { onThemeChange, readChartColors, withAlpha } from "./chart-theme";
import { useChartMeasure } from "./use-chart-measure";

type Mode = "line" | "candles";
const MODES = [
  { id: "line", label: "Line" },
  { id: "candles", label: "Candles" },
] as const;
const RANGE_OPTIONS = RANGES.map((r) => ({ id: r, label: r }));
const REFRESH_MS: Partial<Record<Range, number>> = { "1D": 30_000, "5D": 60_000 };
const MAX_TICK_GAP_SEC = 3_600;
const ZOOM_STEP = 0.7;
const PAN_STEP = 0.15;
/** A coarse interval on a short range (monthly candles on 1M) still opens on a readable number of candles. */
const MIN_PRESET_CANDLES = 12;

const INDICATOR_KEY = "terminal.indicators.v1";

function loadIndicators(): IndicatorId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INDICATOR_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? INDICATORS.map((i) => i.id).filter((id) => raw.includes(id)) : [];
  } catch {
    return [];
  }
}

type Built = {
  bars: Bar[];
  step: number;
  layout: ViewLayout;
  dayStarts: Set<number>;
  volume: Map<number, number>;
};

type Live = Parameters<typeof withLiveBar>[2];

export function PriceChart({ symbol, quote }: { symbol: string; quote?: Quote }) {
  const [range, setRangeId] = useState<Range>("1D");
  const [mode, setMode] = useState<Mode>("line");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [away, setAway] = useState(false);
  const [pickedInterval, setPickedInterval] = useState<Interval | null>(null);
  const [indicators, setIndicators] = useState<IndicatorId[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const indicatorRef = useRef<IndicatorHandle[]>([]);
  const builtRef = useRef<Built | null>(null);
  const viewKeyRef = useRef<string | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const liveRef = useRef<Live>(null);

  const { data, error } = useFetch<ChartPayload>(
    `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`,
    REFRESH_MS[range] ?? 0,
  );
  const payload = data && data.range === range && data.symbol === symbol ? data : null;
  // Candles use the picked interval; the line shows the data at its native resolution.
  const interval: Interval = mode === "candles" ? resolveInterval(range, pickedInterval) : RANGE_INTERVALS[range].options[0];
  const prevClose = quote?.prevClose ?? null;
  const decimals = quote?.decimals ?? 2;

  const syncAway = useCallback((r: { from: number; to: number } | null) => {
    setAway(isAwayFromLatest(r, builtRef.current?.layout ?? null));
  }, []);

  // Create the chart once, with TradingView-style navigation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11.5, attributionLogo: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.1 }, minimumWidth: 64 },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 0.5,
        tickMarkFormatter: (t: Time, type: number) => formatTick(t as number, type, rangeRef.current, builtRef.current?.dayStarts ?? new Set()),
      },
      // A plain mouse drag measures (use-chart-measure); Shift + drag switches panning on for that press.
      handleScroll: { mouseWheel: true, pressedMouseMove: false, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
      kineticScroll: { mouse: true, touch: true },
      // Long-press crosshair ends when the finger lifts, so vertical swipes scroll the page again.
      trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd },
    });
    chartRef.current = chart;

    const onMove = (p: MouseEventParams) => {
      const main = seriesRef.current[0];
      if (!p.time || !main || !p.point) return setHover(null);
      const d = p.seriesData.get(main) as { value?: number; open?: number; high?: number; low?: number; close?: number } | undefined;
      if (!d) return setHover(null);
      const t = p.time as number;
      setHover({ t, value: d.value ?? d.close ?? 0, o: d.open, h: d.high, l: d.low, c: d.close, v: builtRef.current?.volume.get(t) });
    };
    // Dragging the price axis switches auto-scale off; mirror that in the toolbar.
    // Read after lightweight-charts has handled the gesture (an axis double-click resets after pointerup).
    const onPointerUp = () => setTimeout(() => chartRef.current && setAutoScale(chart.priceScale("right").options().autoScale), 60);
    chart.subscribeCrosshairMove(onMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncAway);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("dblclick", onPointerUp);
    const stopTheme = onThemeChange(() => setThemeTick((n) => n + 1));
    return () => {
      stopTheme();
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("dblclick", onPointerUp);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncAway);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
      indicatorRef.current = [];
      builtRef.current = null;
      viewKeyRef.current = null;
    };
  }, [syncAway]);

  useEffect(() => setIndicators(loadIndicators()), []);

  const measureBars = useMemo(
    () => ({ count: () => builtRef.current?.layout.dataCount ?? 0, timeAt: (i: number) => builtRef.current?.bars[i]?.t }),
    [],
  );
  const { drag: measure, cancel: cancelMeasure } = useChartMeasure(containerRef, chartRef, measureBars);
  // Another symbol, range, chart type or interval is different data: end any measure in progress.
  useEffect(() => cancelMeasure(), [symbol, range, mode, interval, cancelMeasure]);

  const toggleIndicator = (id: IndicatorId) => {
    const next = indicators.includes(id) ? indicators.filter((x) => x !== id) : INDICATORS.map((i) => i.id).filter((x) => x === id || indicators.includes(x));
    setIndicators(next);
    try {
      localStorage.setItem(INDICATOR_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    const built = builtRef.current;
    if (!chart || !built) return;
    chart.priceScale("right").applyOptions({ autoScale: true });
    setAutoScale(true);
    setRange(chart, presetRange(built.layout));
  }, []);

  // (Re)build series on new data, mode or theme. Keeps the user's zoom/pan when only the data refreshed.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !payload) return;
    const c = readChartColors();
    const viewKey = `${symbol}|${range}|${mode}|${interval}`;
    const prev = builtRef.current;
    const keepView = viewKeyRef.current === viewKey && prev !== null;
    const prevLogical = keepView ? readRange(chart) : null;
    const wasAtLatest = keepView && !isAwayFromLatest(prevLogical, prev?.layout ?? null);
    const priceScale = chart.priceScale("right");
    const manualPrice = keepView && !priceScale.options().autoScale ? priceScale.getVisibleRange() : null;

    chart.applyOptions({
      layout: { textColor: c.faint },
      grid: { vertLines: { visible: false }, horzLines: { color: c.grid } },
      crosshair:
        mode === "candles"
          ? {
              mode: CrosshairMode.Normal,
              vertLine: { color: c.faint, style: LineStyle.Dashed, width: 1, labelBackgroundColor: c.fg },
              horzLine: { visible: true, labelVisible: true, color: c.faint, style: LineStyle.Dashed, width: 1, labelBackgroundColor: c.fg },
            }
          : {
              mode: CrosshairMode.Magnet,
              vertLine: { color: c.faint, style: LineStyle.Dashed, width: 1, labelBackgroundColor: c.fg },
              horzLine: { visible: false, labelVisible: false },
            },
      localization: { priceFormatter: (p: number) => fmtPrice(p, decimals) },
    });
    removeIndicators(chart, indicatorRef.current);
    indicatorRef.current = [];
    for (const s of seriesRef.current) chart.removeSeries(s);
    seriesRef.current = [];

    let bars = withLiveBar(aggregateTo(payload.bars, interval, payload.step), interval, liveRef.current);
    // Chart data lags the live quote by a minute or two: keep bars that live ticks already added.
    if (keepView && prev && range === "1D" && bars.length) {
      const lastT = bars[bars.length - 1].t;
      const liveTail = prev.bars.filter((b) => b.t > lastT);
      if (liveTail.length) bars = [...bars, ...liveTail];
    }
    const step = Math.max(INTERVAL_SECONDS[interval], payload.step);
    if (bars.length === 0) {
      builtRef.current = null;
      return;
    }
    const rangeStart = indexContaining(bars, payload.presetStart);
    const presetIndex = mode === "candles" && !isIntraday(interval) ? Math.max(0, Math.min(rangeStart, bars.length - MIN_PRESET_CANDLES)) : rangeStart;
    const pad = whitespaceUntil(bars[bars.length - 1].t, payload.sessionEnd, step).map((t) => ({ time: asTime(t) }));
    const baseline = range === "1D" && prevClose != null ? prevClose : (bars[rangeStart]?.c ?? null);

    seriesRef.current = buildSeries({
      chart,
      mode,
      bars,
      pad,
      colors: c,
      baseline,
      prevCloseLine: range === "1D" ? prevClose : null,
      pulse: mode === "line" && range === "1D" && pad.length > 0,
    });
    indicatorRef.current = addIndicators(chart, indicators, bars);
    const layout: ViewLayout = { presetIndex, dataCount: bars.length, padCount: pad.length, mode };
    builtRef.current = {
      bars,
      step,
      layout,
      dayStarts: firstBarOfEachDay(bars),
      volume: new Map(bars.map((b) => [b.t, b.v])),
    };

    if (keepView && prevLogical && prev) {
      if (wasAtLatest) {
        // Following the live edge: keep the zoom width, slide to the newest bar.
        setRange(chart, followLatest(prevLogical, prev.layout, layout));
      } else {
        const shift = indexShift(prev.bars.map((b) => b.t), bars.map((b) => b.t));
        setRange(chart, { from: prevLogical.from + shift, to: prevLogical.to + shift });
      }
      if (manualPrice) {
        priceScale.setAutoScale(false);
        priceScale.setVisibleRange(manualPrice);
      }
    } else {
      chart.priceScale("right").applyOptions({ autoScale: true });
      setAutoScale(true);
      setRange(chart, presetRange(layout));
    }
    viewKeyRef.current = viewKey;
    syncAway(readRange(chart));
  }, [payload, mode, interval, indicators, themeTick, prevClose, range, decimals, symbol, syncAway]);

  // Stream live prices into the latest bar.
  const lastPrice = quote?.last ?? null;
  const tickTime = wallClockSeconds(quote?.time ?? null);
  liveRef.current =
    lastPrice != null && tickTime != null
      ? { open: quote?.open ?? null, high: quote?.high ?? null, low: quote?.low ?? null, last: lastPrice, volume: quote?.volume ?? null, t: tickTime }
      : null;
  useEffect(() => {
    const chart = chartRef.current;
    const built = builtRef.current;
    const main = seriesRef.current[0];
    const live = liveRef.current;
    if (!chart || !payload || !built || !main || !live) return;
    let nextBars: Bar[];
    if (range === "1D") {
      const lastBar = built.bars[built.bars.length - 1];
      if (!lastBar || live.t - lastBar.t > MAX_TICK_GAP_SEC) return;
      if (payload.sessionEnd && live.t >= Math.max(payload.sessionEnd, lastBar.t + built.step)) return;
      const next = applyTick(built.bars, live.last, live.t, built.step);
      if (!next) return;
      nextBars = next.bars;
    } else {
      nextBars = withLiveBar(built.bars, interval, live);
    }
    const bar = nextBars[nextBars.length - 1];
    if (!bar || nextBars === built.bars) return;
    const point = mode === "line" ? { time: asTime(bar.t), value: bar.c } : { time: asTime(bar.t), open: bar.o, high: bar.h, low: bar.l, close: bar.c };
    // A new bar inside the 1D whitespace padding already has a time slot (historical update);
    // otherwise it is a plain append or an edit of the last bar.
    const inPadding = built.layout.padCount > 0;
    const viewBefore = readRange(chart);
    const following = !isAwayFromLatest(viewBefore, built.layout);
    try {
      main.update(point, inPadding);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.warn("[chart] live update skipped", err);
      return;
    }
    const vol = seriesRef.current[1];
    if (vol && bar.v > 0) {
      const { up, down } = readChartColors();
      try {
        vol.update({ time: asTime(bar.t), value: bar.v, color: withAlpha(bar.c >= bar.o ? up : down, 0.28) }, inPadding);
      } catch {
        /* volume is cosmetic; the next refetch fills it in */
      }
    }
    updateIndicators(indicatorRef.current, nextBars);
    const appended = nextBars.length > built.bars.length;
    const layout = appended
      ? { ...built.layout, dataCount: nextBars.length, padCount: Math.max(0, built.layout.padCount - 1) }
      : built.layout;
    built.volume.set(bar.t, bar.v);
    builtRef.current = { ...built, bars: nextBars, layout };
    // A new bar arrived while the user was watching the live edge: keep following it.
    if (appended && following && viewBefore) setRange(chart, followLatest(viewBefore, built.layout, layout));
    syncAway(readRange(chart));
  }, [lastPrice, tickTime, range, mode, interval, payload, syncAway]);

  // Navigation actions shared by the toolbar and the keyboard.
  const nav = useCallback(
    (action: "in" | "out" | "left" | "right" | "latest") => {
      const chart = chartRef.current;
      const built = builtRef.current;
      const r = chart ? readRange(chart) : null;
      if (!chart || !built || !r) return;
      // Zoom around the newest bar while following it (around the centre when browsing history).
      const { dataCount, padCount } = built.layout;
      const anchor = isAwayFromLatest(r, built.layout) ? (r.from + r.to) / 2 : padCount ? dataCount - 1 : r.to;
      if (action === "in") setRange(chart, zoomAt(r, ZOOM_STEP, anchor));
      else if (action === "out") setRange(chart, zoomAt(r, 1 / ZOOM_STEP, anchor));
      else if (action === "left") setRange(chart, panRange(r, -PAN_STEP));
      else if (action === "right") setRange(chart, panRange(r, PAN_STEP));
      else setRange(chart, realtimeRange(r, built.layout));
    },
    [],
  );

  const toggleLog = () => {
    const next = !logScale;
    chartRef.current?.priceScale("right").applyOptions({ mode: next ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    setLogScale(next);
  };

  const enableAutoScale = () => {
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    setAutoScale(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, () => void> = {
      ArrowLeft: () => nav("left"),
      ArrowRight: () => nav("right"),
      ArrowUp: () => nav("in"),
      ArrowDown: () => nav("out"),
      "+": () => nav("in"),
      "=": () => nav("in"),
      "-": () => nav("out"),
      "0": resetView,
      Home: resetView,
      End: () => nav("latest"),
      Escape: () => setExpanded(false),
    };
    const fn = map[e.key];
    if (!fn || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    fn();
  };

  // Double-click / double-tap on the plot resets (axis double-clicks keep lightweight's per-axis reset).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const onDbl = (p: MouseEventParams) => p.point && resetView();
    chart.subscribeDblClick(onDbl);
    return () => chart.unsubscribeDblClick(onDbl);
  }, [resetView]);

  useEffect(() => {
    if (!expanded) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onEsc);
    containerRef.current?.closest("section")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => window.removeEventListener("keydown", onEsc);
  }, [expanded]);

  const selected = payload ? presetBars(payload) : [];
  const first = range === "1D" && prevClose != null ? prevClose : selected[0]?.c;
  const lastClose = lastPrice ?? selected[selected.length - 1]?.c;
  const rangeChange = first != null && lastClose != null ? lastClose - first : null;
  const rangePct = rangeChange != null && first ? (rangeChange / first) * 100 : null;

  return (
    <section className="rounded-2xl border border-line bg-card" aria-label="Price chart">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Segmented label="Chart type" options={MODES} value={mode} onChange={setMode} />
          <IndicatorMenu selected={indicators} onToggle={toggleIndicator} />
        </div>
        <Segmented label="Range" options={RANGE_OPTIONS} value={range} onChange={setRangeId} />
      </div>
      <div className="relative px-1 pb-2 pt-1 sm:px-2">
        <ChartLegend
          hover={hover}
          range={range}
          mode={mode}
          interval={interval}
          decimals={decimals}
          isYield={quote?.isYield}
          summary={
            range === "1D" ? (
              prevClose != null && <span className="text-muted">Prev close <span className="text-fg">{fmtPrice(prevClose, decimals, quote?.isYield)}</span></span>
            ) : rangePct != null ? (
              <span className={rangePct >= 0 ? "text-up" : "text-down"}>
                {fmtSigned(rangeChange, decimals)} ({fmtPct(rangePct)}) <span className="text-faint">{rangeLabel(range)}</span>
              </span>
            ) : null
          }
        />
        <div className="relative">
          <div
            ref={containerRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-label="Interactive price chart. Drag across it to measure the change between two points. Scroll or use arrow keys to zoom and pan, Shift and drag to pan, 0 to reset."
            className={`w-full cursor-crosshair rounded-lg outline-offset-2 ${expanded ? "h-[72vh] min-h-[420px]" : "h-[280px] sm:h-[340px]"}`}
            data-testid="price-chart"
          />
          <ChartMeasureOverlay
            chart={chartRef.current}
            series={seriesRef.current[0] ?? null}
            bars={builtRef.current?.bars ?? []}
            drag={measure}
            mode={mode}
            range={range}
            interval={interval}
            decimals={decimals}
          />
        </div>
        {away && (
          <button
            type="button"
            onClick={() => nav("latest")}
            className="absolute bottom-10 right-20 z-10 flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[12px] font-medium text-muted shadow-[0_4px_14px_rgba(0,0,0,0.1)] hover:text-fg"
            aria-label="Scroll to latest bar"
          >
            Latest
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m6 17 5-5-5-5M13 17l5-5-5-5" /></svg>
          </button>
        )}
        {!payload && !error && <div className="skeleton absolute inset-x-4 bottom-4 top-12 opacity-60" />}
        {error && !payload && (
          <p className="absolute inset-0 grid place-items-center text-[13px] text-muted">Chart data is unavailable right now.</p>
        )}
        {payload && payload.bars.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-[13px] text-muted">No trading data for this range.</p>
        )}
      </div>
      <ChartControls
        interval={interval}
        intervalOptions={mode === "candles" ? RANGE_INTERVALS[range].options : []}
        onInterval={setPickedInterval}
        logScale={logScale}
        autoScale={autoScale}
        expanded={expanded}
        onZoomIn={() => nav("in")}
        onZoomOut={() => nav("out")}
        onReset={resetView}
        onToggleLog={toggleLog}
        onAutoScale={enableAutoScale}
        onToggleExpand={() => setExpanded((x) => !x)}
      />
    </section>
  );
}
