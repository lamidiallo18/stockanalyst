import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/ui/primitives";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Thesis Tracker"
        subtitle="Saved theses, assumptions, entry price, catalysts, exit conditions, updates over time."
      />
      <ComingSoon page="Thesis tracker page" phase="Phase 4">
        Saved memos, the what-would-make-me-wrong checklist, and the update timeline arrive in Phase 4.
      </ComingSoon>
    </div>
  );
}
