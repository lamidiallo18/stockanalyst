import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/ui/primitives";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Source Library"
        subtitle="Uploaded files, extracted text, associated analyses, and source citations."
      />
      <ComingSoon page="Source library page" phase="Phase 3">
        Upload, text/OCR extraction, chunking and citation backlinks arrive in Phase 3.
      </ComingSoon>
    </div>
  );
}
