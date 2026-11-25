import type { Metadata } from "next";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";

export const metadata: Metadata = {
  title: "Portfolio · Terminal",
  description: "Your holdings, cash, income and returns from your own transactions, valued with live prices. Stored only in this browser.",
};

export default function PortfolioPage() {
  return <PortfolioScreen />;
}
