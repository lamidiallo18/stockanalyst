import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/ui/primitives";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Company Analysis"
        subtitle="Market data, financials, valuation, peers, moat/risk, and the generated memo."
      />
      <ComingSoon page="Company analysis page" phase="Phase 1–2">
        Financial summary, valuation and peer comps appear in Phase 1; the generated memo with citations and scores in Phase 2.
      </ComingSoon>
    </div>
  );
}
