import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/states";
import { ResearchView } from "@/components/research/research-view";

export const metadata: Metadata = { title: "Research · Terminal" };

export default function ResearchPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={6} />}>
      <ResearchView />
    </Suspense>
  );
}
