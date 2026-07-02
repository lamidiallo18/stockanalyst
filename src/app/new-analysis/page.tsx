import { PageHeader } from "@/components/page-header";
import { NewAnalysisClient } from "./new-analysis-client";

export default function NewAnalysisPage() {
  return (
    <div>
      <PageHeader
        title="New Analysis"
        subtitle="Enter a ticker, write your thesis, pick a depth. Cost is estimated before the run; actuals are stored on the memo."
      />
      <NewAnalysisClient />
    </div>
  );
}
