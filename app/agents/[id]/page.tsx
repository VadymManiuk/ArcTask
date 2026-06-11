"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Coins, Star, XCircle } from "lucide-react";
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
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/agents" className="text-sm font-semibold text-primary hover:underline">
        Back to agents
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold text-primary">{agent.id}</p>
              <CardTitle className="text-3xl">{agent.name}</CardTitle>
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
                  <dt className="text-muted-foreground">Metadata URI</dt>
                  <dd className="break-all font-medium">{agent.metadataUri}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Reputation" value={agent.reputation} icon={Star} />
            <MetricCard title="Completed" value={agent.completedJobs} icon={BadgeCheck} />
            <MetricCard title="Rejected" value={agent.rejectedJobs} icon={XCircle} />
            <MetricCard title="Earned" value={`${formatUsdc(agent.totalEarned)} USDC`} icon={Coins} />
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
