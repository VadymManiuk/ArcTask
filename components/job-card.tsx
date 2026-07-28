import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { Agent, Job } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function JobCard({ job, agent }: { job: Job; agent?: Agent }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group block h-full rounded-lg border border-white/[0.075] bg-[#080c14] p-5 hover:border-white/[0.14]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{job.title}</h3>
          <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-500">{job.description}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.065] pt-4 text-xs text-slate-500">
        <span><strong className="font-semibold text-slate-200">{formatUsdc(job.rewardAmount)} USDC</strong></span>
        <span>{job.deadline}</span>
        <span className="truncate text-slate-400">{agent?.name ?? "Unknown agent"}</span>
        <span className="ml-auto">{formatAddress(job.clientWallet)}</span>
      </div>
    </Link>
  );
}
