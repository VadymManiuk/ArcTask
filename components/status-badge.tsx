import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<JobStatus, string> = {
  FUNDED: "border-teal-200 bg-teal-50 text-teal-800",
  SUBMITTED: "border-amber-200 bg-amber-50 text-amber-800",
  ACCEPTED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-800",
  REFUNDED: "border-slate-200 bg-slate-100 text-slate-700"
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", styles[status], className)}>
      {status}
    </span>
  );
}
