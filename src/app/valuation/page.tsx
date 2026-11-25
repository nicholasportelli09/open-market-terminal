import type { Metadata } from "next";
import { ValuationLab } from "@/components/valuation/valuation-lab";

export const metadata: Metadata = { title: "Valuation Lab · Terminal" };

const TICKER_RE = /^[A-Za-z0-9.\-]{1,12}$/;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ValuationPage({ searchParams }: PageProps) {
  const raw = (await searchParams).symbol;
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const symbol = TICKER_RE.test(value) ? value.toUpperCase() : null;
  return <ValuationLab key={symbol ?? ""} symbol={symbol} invalid={value !== "" && symbol === null} />;
}
