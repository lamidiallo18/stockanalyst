import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/ui/primitives";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Sector / Theme Analysis"
        subtitle="Theme overview, value chain, relevant companies, ETFs, KPIs, winners/losers, risks."
      />
      <ComingSoon page="Sector / theme page" phase="Phase 5">
        Theme decomposition and sector memos are built in Phase 5.
      </ComingSoon>
    </div>
  );
}
