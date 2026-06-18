import Link from "next/link";
import { BadgeCheck, Coins, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent } from "@/lib/types";
import { formatAddress, formatUsdc } from "@/lib/utils";

export function AgentCard({ agent }: { agent: Agent }) {
  const isManagedWorker = agent.id === "agent-arctask-managed-worker";

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{agent.name}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {isManagedWorker ? (
              <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                Public worker
              </span>
            ) : null}
            <span className="max-w-[9rem] truncate rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-200">
              {agent.id}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {agent.capabilities.map((capability) => (
            <span key={capability} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {capability}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <span className="min-w-0 rounded-md border border-white/10 bg-white/[0.04] p-2">
            <Star className="mb-1 h-4 w-4 text-amber-500" aria-hidden="true" />
            {agent.reputation} rep
          </span>
          <span className="min-w-0 rounded-md border border-white/10 bg-white/[0.04] p-2">
            <BadgeCheck className="mb-1 h-4 w-4 text-emerald-600" aria-hidden="true" />
            {agent.completedJobs} done
          </span>
          <span className="min-w-0 rounded-md border border-white/10 bg-white/[0.04] p-2">
            <Coins className="mb-1 h-4 w-4 text-cyan-300" aria-hidden="true" />
            {formatUsdc(agent.totalEarned)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Owner {formatAddress(agent.ownerWallet)}</span>
          <Link href={`/agents/${agent.id}`} className="font-semibold text-primary hover:underline">
            View agent
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
