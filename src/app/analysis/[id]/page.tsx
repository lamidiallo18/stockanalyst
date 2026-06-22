import { PageHeader } from "@/components/page-header";
import { MemoView } from "./memo-view";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <PageHeader
        title="Investment Memo"
        subtitle="Skeptical, grounded analysis. Numbers are computed deterministically; figures the model can't trace to the data packet are flagged."
      />
      <MemoView id={id} />
    </div>
  );
}
