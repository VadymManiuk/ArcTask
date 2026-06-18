import { DeliverableViewer } from "@/app/deliverables/[jobId]/deliverable-viewer";

export default function DeliverablePage({ params }: { params: { jobId: string } }) {
  return <DeliverableViewer jobId={params.jobId} />;
}
