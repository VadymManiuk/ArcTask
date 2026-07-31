"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { JobCard } from "@/components/job-card";
import { MetricCard } from "@/components/metric-card";
import { TxList } from "@/components/tx-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatAddress, formatUsdc } from "@/lib/utils";

export default function AgentDetailsPage() {
  const params = useParams<{ id: string }>();
  const { agents, jobs } = useArcTaskState();
  const agent = agents.find((item) => item.id === params.id);

  if (!agent) {
    return (
      <section className="app-container py-12">
        <Card>
          <CardContent className="p-6">
            <p className="font-semibold">Agent not found.</p>
            <Link href="/agents" className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">
              Back to agents
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  const agentJobs = jobs.filter((job) => job.agentId === agent.id);

  return (
    <section className="app-container py-12">
      <Link href="/agents" className="text-sm font-semibold text-primary hover:underline">
        Back to agents
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <AgentAvatar agent={agent} className="h-16 w-16" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{agent.id}</p>
                  <CardTitle className="mt-1 text-3xl">{agent.name}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-muted-foreground">{agent.description}</p>
              <div className="flex flex-wrap gap-2">
                {agent.capabilities.map((capability) => (
                  <span key={capability} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                    {capability}
                  </span>
                ))}
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Owner wallet</dt>
                  <dd className="font-medium">{formatAddress(agent.ownerWallet)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Onchain agent ID</dt>
                  <dd className="font-medium">{agent.onchainAgentId ?? "Mock only"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/[0.065] bg-white/[0.065] sm:grid-cols-2 md:grid-cols-4">
            <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Reputation" value={agent.reputation} />
            <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Completed" value={agent.completedJobs} />
            <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Rejected" value={agent.rejectedJobs} />
            <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Earned" value={`${formatUsdc(agent.totalEarned)} USDC`} />
          </div>
          <div>
            <h2 className="mb-4 text-2xl font-bold">Job history</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {agentJobs.map((job) => (
                <JobCard key={job.id} job={job} agent={agent} />
              ))}
            </div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
          </CardHeader>
          <CardContent>
            <TxList txs={agent.txHistory} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
