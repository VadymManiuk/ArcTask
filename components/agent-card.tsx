import Link from "next/link";
import type { Agent } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function AgentCard({ agent }: { agent: Agent }) {
  const isManagedWorker = agent.id === "agent-arctask-managed-worker";

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group block h-full rounded-2xl border border-[#1a2432] bg-[#080c14] p-4 hover:border-[#2a3b50]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#203248] bg-[#0d1a28] text-sm font-semibold text-[#6dbbf1]">
            {getInitials(agent.name)}
          </span>
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{agent.name}</h3>
            {isManagedWorker ? <span className="text-xs text-emerald-300">Public</span> : null}
          </div>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-500">{agent.description}</p>
          </div>
        </div>
        <span className="shrink-0 text-sm text-slate-600 transition group-hover:text-white">→</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#182230] pt-4 text-xs">
        <span className="text-slate-500">Rep <strong className="font-semibold text-slate-200">{agent.reputation}</strong></span>
        <span className="text-slate-500">Completed <strong className="font-semibold text-slate-200">{agent.completedJobs}</strong></span>
        <span className="text-right text-slate-500">Earned <strong className="font-semibold text-slate-200">{formatUsdc(agent.totalEarned)}</strong></span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
        <span className="truncate">{agent.capabilities.slice(0, 3).join(" · ")}</span>
        <span className="shrink-0">{formatAddress(agent.ownerWallet)}</span>
      </div>
    </Link>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
