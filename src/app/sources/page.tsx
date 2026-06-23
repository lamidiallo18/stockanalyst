import { PageHeader } from "@/components/page-header";
import { SourcesClient } from "./sources-client";

export default function SourcesPage() {
  return (
    <div>
      <PageHeader
        title="Source Library"
        subtitle="Upload filings, articles, transcripts, decks or screenshots. Text is extracted and chunked locally, then cited in memos."
      />
      <SourcesClient />
    </div>
  );
}
