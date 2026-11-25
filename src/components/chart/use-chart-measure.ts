"use client";

import type { IChartApi } from "lightweight-charts";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** A touch must rest this long before a drag measures (lightweight-charts starts its own crosshair at 240 ms). */
const LONG_PRESS_MS = 260;
/**
 * lightweight-charts drops its long tap and starts panning once a touch has moved this far (Manhattan distance,
 * its CancelTapManhattanDistance); the pending measure is cancelled on the same rule so both never run at once.
 */
const TOUCH_CANCEL_MANHATTAN_PX = 5;

/** Bar times (seconds) where the drag started (a) and where it is now (b). Times survive data refreshes. */
export type MeasureDrag = { a: number; b: number };

type Bars = {
  count: () => number;
  timeAt: (index: number) => number | undefined;
};

/**
 * Press and drag on the chart to measure the change between two points; on touch screens, press and hold first.
 * Holding Shift while pressing pans the chart instead, which is what a plain drag did before.
 */
export function useChartMeasure(containerRef: RefObject<HTMLDivElement | null>, chartRef: RefObject<IChartApi | null>, bars: Bars) {
  const [drag, setDrag] = useState<MeasureDrag | null>(null);
  const cancelRef = useRef<() => void>(() => setDrag(null));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let pointerId: number | null = null;
    let anchor: number | null = null;
    let downAt: { x: number; y: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /** Time of the bar under a viewport x, clamped to the data; null before the chart has data. */
    const timeAt = (clientX: number): number | null => {
      const chart = chartRef.current;
      const count = bars.count();
      if (!chart || count === 0) return null;
      const x = Math.min(Math.max(clientX - el.getBoundingClientRect().left, 0), chart.timeScale().width());
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return null;
      return bars.timeAt(Math.min(Math.max(Math.round(logical), 0), count - 1)) ?? null;
    };
    /** On the plotting area of any pane (price chart or an indicator pane), not on the price or time axis. */
    const onPlot = (e: PointerEvent): boolean => {
      const chart = chartRef.current;
      if (!chart) return false;
      const box = el.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      return x >= 0 && y >= 0 && x <= chart.timeScale().width() && y <= box.height - chart.timeScale().height();
    };
    const begin = (clientX: number): boolean => {
      const t = timeAt(clientX);
      if (t === null) return false;
      anchor = t;
      setDrag({ a: t, b: t });
      return true;
    };
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pointerId = null;
      anchor = null;
      downAt = null;
      setDrag(null);
    };
    cancelRef.current = stop;

    const onDown = (e: PointerEvent) => {
      const chart = chartRef.current;
      if (!chart) return;
      // A second finger (pinch zoom) cancels a pending or running measure.
      if (pointerId !== null) {
        if (e.pointerType !== "mouse") stop();
        return;
      }
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        // Read by lightweight-charts on each move of this press, in every pane: Shift pans, a plain press measures.
        chart.applyOptions({ handleScroll: { pressedMouseMove: e.shiftKey } });
        // Ctrl + click is a right-click on a Mac.
        if (!e.shiftKey && !e.ctrlKey && onPlot(e) && begin(e.clientX)) pointerId = e.pointerId;
        return;
      }
      if (!e.isPrimary || !onPlot(e)) return;
      pointerId = e.pointerId;
      downAt = { x: e.clientX, y: e.clientY };
      const startX = e.clientX;
      timer = setTimeout(() => {
        timer = null;
        if (!begin(startX)) stop();
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      // The button was released somewhere the pointerup never reached us (e.g. over a context menu).
      if (e.pointerType === "mouse" && (e.buttons & 1) === 0) return stop();
      if (timer) {
        if (downAt && Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) >= TOUCH_CANCEL_MANHATTAN_PX) stop();
        return;
      }
      if (anchor === null) return;
      const b = timeAt(e.clientX);
      if (b === null) return;
      const a = anchor;
      setDrag((prev) => (prev && prev.a === a && prev.b === b ? prev : { a, b }));
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId === pointerId) stop();
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("contextmenu", stop);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("blur", stop);
    return () => {
      if (timer) clearTimeout(timer);
      cancelRef.current = () => setDrag(null);
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("contextmenu", stop);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", stop);
    };
  }, [containerRef, chartRef, bars]);

  const cancel = useCallback(() => cancelRef.current(), []);
  return { drag, cancel };
}
