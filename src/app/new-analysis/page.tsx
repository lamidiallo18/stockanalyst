import { PageHeader } from "@/components/page-header";
import { NewAnalysisClient } from "./new-analysis-client";

export default function NewAnalysisPage() {
  return (
    <div>
      <PageHeader
        title="New Analysis"
        subtitle="Enter a ticker, write your thesis, pick a depth. The pipeline pulls data, computes metrics + scores, and runs a skeptical, grounded memo."
      />
      <NewAnalysisClient />
    </div>
  );
}
