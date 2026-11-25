"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { impliedUpside } from "@/lib/analyst-types";
import { fmtPct, fmtPrice } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { readSavedModel, VALUATION_STORAGE_KEY, type SavedModel } from "./saved-model";
import { Label } from "./section-state";

const linkBtn =
  "inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg";

function useSavedModel(symbol: string): SavedModel | null | undefined {
  const [model, setModel] = useState<SavedModel | null | undefined>(undefined);
  useEffect(() => {
    const load = () => setModel(readSavedModel(symbol));
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === VALUATION_STORAGE_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [symbol]);
  return model;
}

function Value({ label, value, price, decimals, strong = false }: { label: string; value: number | null; price: number | null; decimals: number; strong?: boolean }) {
  const up = impliedUpside(value, price);
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-faint">{label}</div>
      <div className={`num truncate font-semibold tracking-tight ${strong ? "text-[22px]" : "text-[16px]"}`}>{fmtPrice(value, decimals)}</div>
      <div className={`num text-[12px] ${up == null ? "text-faint" : up >= 0 ? "text-up" : "text-down"}`}>{up == null ? "—" : `${fmtPct(up, 1)} vs price`}</div>
    </div>
  );
}

type OurModelProps = { symbol: string; price: number | null; decimals: number };

/** The owner's own Valuation Lab model, kept visually and verbally apart from analyst consensus. */
export function OurModel({ symbol, price, decimals }: OurModelProps) {
  const model = useSavedModel(symbol);
  const href = `/valuation?symbol=${encodeURIComponent(symbol)}`;
  return (
    <Panel title="Our model (not analyst consensus)" className="border-dashed">
      {model === undefined ? (
        <LoadingBlock rows={2} />
      ) : model === null ? (
        <EmptyState
          title={`No saved valuation for ${symbol}`}
          body="Build a DCF in the Valuation Lab and save it; its fair value and bear / base / bull cases appear here next to the analyst view."
          action={<Link href={href} className={`${linkBtn} mt-2`}>Build a valuation model</Link>}
        />
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Value label={model.weighted != null ? "Fair value (weighted)" : "Fair value"} value={model.weighted ?? model.perShare} price={price} decimals={decimals} strong />
            <Value label="Bear" value={model.bear} price={price} decimals={decimals} />
            <Value label="Base" value={model.base} price={price} decimals={decimals} />
            <Value label="Bull" value={model.bull} price={price} decimals={decimals} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>Saved model · {model.currency}</Label>
              <SourceTag
                provenance={{
                  source: "model",
                  asOf: model.updatedAt,
                  note: model.priceAtSave != null ? `price at save ${fmtPrice(model.priceAtSave, decimals)} · stored on this device` : "stored on this device",
                }}
              />
            </div>
            <Link href={href} className={linkBtn}>Open in Valuation Lab</Link>
          </div>
        </div>
      )}
    </Panel>
  );
}
