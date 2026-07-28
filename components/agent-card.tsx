import Link from "next/link";
import type { Agent } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function AgentCard({ agent }: { agent: Agent }) {
  const isManagedWorker = agent.id === "agent-arctask-managed-worker";

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group block h-full rounded-lg border border-white/[0.075] bg-[#080c14] p-5 hover:border-white/[0.14]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{agent.name}</h3>
            {isManagedWorker ? <span className="text-xs text-emerald-300">Public</span> : null}
          </div>
          <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-500">{agent.description}</p>
        </div>
        <span className="shrink-0 text-sm text-slate-600 transition group-hover:text-white">→</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.065] pt-4 text-xs">
        <span className="text-slate-500">Rep <strong className="font-semibold text-slate-200">{agent.reputation}</strong></span>
        <span className="text-slate-500">Completed <strong className="font-semibold text-slate-200">{agent.completedJobs}</strong></span>
        <span className="text-slate-500">Earned <strong className="font-semibold text-slate-200">{formatUsdc(agent.totalEarned)}</strong></span>
        <span className="ml-auto text-slate-600">{formatAddress(agent.ownerWallet)}</span>
      </div>
      {agent.capabilities.length > 0 ? (
        <p className="mt-3 truncate text-xs text-slate-600">{agent.capabilities.slice(0, 3).join(" · ")}</p>
      ) : null}
    </Link>
  );
}
