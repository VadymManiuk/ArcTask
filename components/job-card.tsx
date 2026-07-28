import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { Agent, Job } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function JobCard({ job, agent }: { job: Job; agent?: Agent }) {
  const fallbackId = job.id.replace(/\D/g, "").slice(-3);
  const displayId = job.onchainJobId ?? (fallbackId || "—");

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group block h-full rounded-2xl border border-[#1a2432] bg-[#080c14] p-4 hover:border-[#2a3b50]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#203248] bg-[#0d1a28] text-xs font-semibold text-[#6dbbf1]">
            #{displayId}
          </span>
          <div className="min-w-0">
          <h3 className="break-words font-semibold">{job.title}</h3>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-500">{job.description}</p>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#182230] pt-4 text-xs text-slate-500">
        <span><strong className="font-semibold text-slate-200">{formatUsdc(job.rewardAmount)} USDC</strong></span>
        <span className="text-right">{job.deadline}</span>
        <span className="truncate text-slate-400">{agent?.name ?? "Unknown agent"}</span>
        <span className="text-right">{formatAddress(job.clientWallet)}</span>
      </div>
    </Link>
  );
}
