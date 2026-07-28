import Link from "next/link";
import { ArrowUpRight, CalendarDays, Coins } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent, Job } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function JobCard({ job, agent }: { job: Job; agent?: Agent }) {
  return (
    <Card className="group h-full hover:border-white/[0.14]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">{job.title}</CardTitle>
            <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-500">{job.description}</p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={job.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.065] bg-[#060a11] p-2.5">
            <Coins className="h-4 w-4 shrink-0 text-[#42adff]" aria-hidden="true" />
            <span className="truncate">{formatUsdc(job.rewardAmount)} USDC</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.065] bg-[#060a11] p-2.5">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="truncate">{job.deadline}</span>
          </span>
        </div>
        <dl className="grid gap-2.5 border-t border-white/[0.06] pt-4 text-xs text-slate-600">
          <div className="flex justify-between gap-3">
            <dt>Agent</dt>
            <dd className="min-w-0 truncate font-medium text-slate-300">{agent?.name ?? "Unknown agent"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Client</dt>
            <dd className="shrink-0">{formatAddress(job.clientWallet)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Evaluator</dt>
            <dd className="shrink-0">{formatAddress(job.evaluatorWallet)}</dd>
          </div>
        </dl>
        <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#58b7ff]">
          Open job <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
