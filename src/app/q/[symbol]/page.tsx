import { notFound } from "next/navigation";
import { QuoteView } from "@/components/quote/quote-view";

const SYMBOL_RE = /^[A-Za-z0-9.@=\-^_]{1,24}$/;

export default async function QuotePage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  if (!SYMBOL_RE.test(symbol)) notFound();
  return <QuoteView key={symbol} symbol={symbol} />;
}
