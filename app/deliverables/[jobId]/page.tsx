import { DeliverableViewer } from "./deliverable-viewer";

export default async function DeliverablePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <DeliverableViewer jobId={jobId} />;
}
