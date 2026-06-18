import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<JobStatus, string> = {
  FUNDED: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  SUBMITTED: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  ACCEPTED: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  REJECTED: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  REFUNDED: "border-slate-300/20 bg-slate-300/10 text-slate-200"
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", styles[status], className)}>
      {status}
    </span>
  );
}
