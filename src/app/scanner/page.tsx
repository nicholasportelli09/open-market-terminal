import type { Metadata } from "next";
import { ScannerView } from "@/components/scanner/scanner-view";

export const metadata: Metadata = {
  title: "Scanner · Terminal",
  description: "Rank the S&P 100 on value, quality, growth, catalysts and risk from SEC filings and CNBC prices.",
};

export default function ScannerPage() {
  return <ScannerView />;
}
