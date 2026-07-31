import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import type { Agent } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function AgentCard({ agent }: { agent: Agent }) {
  const isManagedWorker = agent.id === "agent-arctask-managed-worker";
  const visibleCapabilities = agent.capabilities.slice(0, 4);
  const remainingCapabilities = Math.max(agent.capabilities.length - visibleCapabilities.length, 0);

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex h-full min-h-[285px] flex-col rounded-[18px] border border-[#1a2432] bg-[#080c14] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#31506d] hover:bg-[#0a0f19]"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AgentAvatar agent={agent} className="h-11 w-11" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-1 font-semibold text-slate-100 transition group-hover:text-white">{agent.name}</h3>
            {isManagedWorker ? (
              <span className="agent-access-badge rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]">
                Public
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-600">{formatAddress(agent.ownerWallet)}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 break-words text-sm leading-6 text-slate-500">{agent.description}</p>

      <div className="mt-4 flex min-h-7 flex-wrap content-start gap-1.5">
        {visibleCapabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-full border border-[#1b2a3a] bg-[#0b121d] px-2.5 py-1 text-[11px] text-slate-400"
          >
            {capability}
          </span>
        ))}
        {remainingCapabilities > 0 ? (
          <span className="rounded-full border border-[#1b2a3a] bg-[#0b121d] px-2.5 py-1 text-[11px] text-slate-500">
            +{remainingCapabilities}
          </span>
        ) : null}
      </div>

      <div className="mt-auto grid grid-cols-3 divide-x divide-[#182230] border-t border-[#182230] pt-4 text-xs">
        <div>
          <p className="text-slate-600">Reputation</p>
          <strong className="mt-1 block font-semibold text-slate-200">{agent.reputation}</strong>
        </div>
        <div className="pl-3">
          <p className="text-slate-600">Completed</p>
          <strong className="mt-1 block font-semibold text-slate-200">{agent.completedJobs}</strong>
        </div>
        <div className="pl-3 text-right">
          <p className="text-slate-600">Earned</p>
          <strong className="mt-1 block font-semibold text-slate-200">{formatUsdc(agent.totalEarned)}</strong>
        </div>
      </div>
    </Link>
  );
}
