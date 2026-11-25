import type { Bar, ChartPayload } from "./types";

/** The selected-range tail of a payload (what the range buttons mean); earlier bars are scroll-back history. */
export function presetBars(payload: Pick<ChartPayload, "bars" | "presetStart">): Bar[] {
  const start = payload.presetStart;
  return start == null ? payload.bars : payload.bars.filter((b) => b.t >= start);
}
