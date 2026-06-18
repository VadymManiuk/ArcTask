import Link from "next/link";
import { CalendarDays, Coins } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent, Job } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function JobCard({ job, agent }: { job: Job; agent?: Agent }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">{job.title}</CardTitle>
            <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{job.description}</p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={job.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <span className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] p-2">
            <Coins className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
            <span className="truncate">{formatUsdc(job.rewardAmount)} USDC</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] p-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
            <span className="truncate">{job.deadline}</span>
          </span>
        </div>
        <dl className="grid gap-2 text-sm text-muted-foreground">
          <div className="flex justify-between gap-3">
            <dt>Agent</dt>
            <dd className="min-w-0 truncate font-medium text-foreground">{agent?.name ?? "Unknown agent"}</dd>
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
        <Link href={`/jobs/${job.id}`} className="inline-flex font-semibold text-primary hover:underline">
          Open job
        </Link>
      </CardContent>
    </Card>
  );
}
