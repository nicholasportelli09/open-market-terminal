import { notFound } from "next/navigation";
import { ForecastView } from "@/components/forecast/forecast-view";

const SYMBOL_RE = /^[A-Za-z0-9.@=\-^_]{1,24}$/;

export default async function ForecastPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  if (!SYMBOL_RE.test(symbol)) notFound();
  return <ForecastView key={symbol} symbol={symbol} />;
}
