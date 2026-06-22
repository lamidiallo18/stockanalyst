import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/ui/primitives";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Portfolio"
        subtitle="Holdings, exposures, concentration, and candidate overlap simulation."
      />
      <ComingSoon page="Portfolio page" phase="Phase 4">
        Editable holdings, sector/theme/geo/factor exposure charts, HHI concentration and overlap warnings arrive in Phase 4.
      </ComingSoon>
    </div>
  );
}
