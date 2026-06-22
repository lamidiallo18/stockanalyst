import { PageHeader } from "@/components/page-header";
import { CompanyClient } from "./company-client";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Company Analysis"
        subtitle="Live financials, valuation, and peer comps — every figure tagged with a reliability flag. The generated memo (Phase 2) builds on this data."
      />
      <CompanyClient />
    </div>
  );
}
