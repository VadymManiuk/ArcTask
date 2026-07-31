import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<JobStatus, string> = {
  FUNDED: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  SUBMITTED: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  ACCEPTED: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  REJECTED: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  REFUNDED: "border-slate-300/20 bg-slate-300/10 text-slate-200",
  DISPUTED: "border-amber-300/25 bg-amber-300/10 text-amber-100"
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        "status-badge inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.055em]",
        styles[status],
        className
      )}
    >
      {status}
    </span>
  );
}
