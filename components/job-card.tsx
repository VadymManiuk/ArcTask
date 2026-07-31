import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { Agent, Job } from "@/lib/types";
import { formatShortDate, formatUsdc } from "@/lib/utils";

export function JobCard({ job, agent }: { job: Job; agent?: Agent }) {
  const fallbackId = job.id.replace(/\D/g, "").slice(-3);
  const displayId = job.onchainJobId ?? (fallbackId || "—");

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex h-full min-h-[260px] flex-col rounded-[18px] border border-[#1a2432] bg-[#080c14] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#31506d] hover:bg-[#0a0f19]"
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={job.status} />
        <span className="text-xs text-slate-600">Job #{displayId}</span>
      </div>

      <h3 className="mt-5 line-clamp-2 break-words text-lg font-semibold leading-7 tracking-[-0.025em] text-slate-100 transition group-hover:text-white">
        {job.title}
      </h3>
      <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-slate-500">{job.description}</p>

      <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-[#35aaf8]" aria-hidden="true" />
        <span className="truncate">{agent?.name ?? "Unassigned agent"}</span>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-4 border-t border-[#182230] pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">Reward</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatUsdc(job.rewardAmount)} USDC</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600">Deadline</p>
          <p className="mt-1 text-sm font-medium text-slate-300">{formatShortDate(job.deadline)}</p>
        </div>
      </div>
    </Link>
  );
}
