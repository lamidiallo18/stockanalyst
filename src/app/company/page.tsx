import { PageHeader } from "@/components/page-header";
import { CompanyClient } from "./company-client";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Company Analysis"
        subtitle="Live financials, valuation, implied expectations and peer comps — every figure carries a reliability flag; provider disagreements are surfaced, not hidden."
      />
      <CompanyClient />
    </div>
  );
}
