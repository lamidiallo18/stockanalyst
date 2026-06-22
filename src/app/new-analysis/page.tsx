import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/ui/primitives";

export default function NewAnalysisPage() {
  return (
    <div>
      <PageHeader
        title="New Analysis"
        subtitle="Enter a ticker, company, sector or theme · write your thesis · attach files · pick a depth."
      />
      <ComingSoon page="Analysis wizard" phase="Phase 2">
        The guided flow (subject → type → thesis → file upload → depth → run)
        with live job progress is built in Phase 2 once the data spine and memo
        pipeline are in place.
      </ComingSoon>
    </div>
  );
}
