import type { Metadata } from "next";
import { MacroDashboard } from "@/components/macro/macro-dashboard";

export const metadata: Metadata = {
  title: "Macro · Terminal",
  description: "Policy rates, the Treasury curve, inflation, credit and cross-asset risk, with sources and as-of dates.",
};

export default function MacroPage() {
  return <MacroDashboard />;
}
