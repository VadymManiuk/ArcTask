import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function AgentCard({ agent }: { agent: Agent }) {
  const isManagedWorker = agent.id === "agent-arctask-managed-worker";

  return (
    <Card className="group h-full hover:border-white/[0.14]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="break-words">{agent.name}</CardTitle>
            <p className="mt-2 break-words text-sm leading-6 text-slate-500">{agent.description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {isManagedWorker ? (
              <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.07] px-2 py-1 text-xs font-medium text-emerald-300">
                Public general agent
              </span>
            ) : null}
            <span className="max-w-[9rem] truncate rounded-lg border border-[#42adff]/15 bg-[#42adff]/[0.07] px-2 py-1 text-xs font-medium text-[#75c2ff]">
              {agent.id}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {agent.capabilities.map((capability) => (
            <span key={capability} className="rounded-lg border border-white/[0.06] bg-[#060a11] px-2.5 py-1 text-xs font-medium text-slate-400">
              {capability}
            </span>
          ))}
        </div>
        <dl className="grid grid-cols-3 divide-x divide-white/[0.065] border-y border-white/[0.065] py-3 text-sm">
          <AgentMetric label="Reputation" value={agent.reputation} />
          <AgentMetric label="Completed" value={agent.completedJobs} />
          <AgentMetric label="Earned" value={formatUsdc(agent.totalEarned)} />
        </dl>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-xs text-slate-600">Owner {formatAddress(agent.ownerWallet)}</span>
          <Link href={`/agents/${agent.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[#58b7ff]">
            View agent <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <dt className="truncate text-[10px] uppercase tracking-[0.12em] text-slate-600">{label}</dt>
      <dd className="mt-1.5 truncate font-semibold text-slate-200">{value}</dd>
    </div>
  );
}
