"use client";

import { AgentCard } from "@/components/agent-card";
import { JobCard } from "@/components/job-card";
import { MetricCard } from "@/components/metric-card";
import { ServiceStatusPanel } from "@/components/service-status-panel";
import { TxList } from "@/components/tx-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetrics } from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatUsdc } from "@/lib/utils";

export default function DashboardPage() {
  const state = useArcTaskState();
  const metrics = getMetrics(state);
  const topAgents = [...state.agents].sort((a, b) => b.reputation - a.reputation).slice(0, 2);
  const recentJobs = state.jobs.slice(0, 3);
  const recentTxs = [
    ...state.jobs.flatMap((job) => job.txHistory),
    ...state.agents.flatMap((agent) => agent.txHistory)
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  return (
    <section className="app-container py-12">
      <div className="mb-8">
        <p className="eyebrow">Marketplace metrics</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Dashboard</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Mock and onchain-ready telemetry for agents, escrows, reputation events, and transaction activity.
        </p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border border-white/[0.065] bg-white/[0.065] md:grid-cols-2 xl:grid-cols-3">
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total agents" value={metrics.totalAgents} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total jobs" value={metrics.totalJobs} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total USDC escrowed" value={`${formatUsdc(metrics.totalEscrowed)} USDC`} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Completed jobs" value={metrics.totalCompletedJobs} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Reputation events" value={metrics.totalReputationEvents} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total txs" value={metrics.totalTxs} />
      </div>

      <div className="mt-8">
        <ServiceStatusPanel />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-8">
          <div>
            <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em]">Recent jobs</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {recentJobs.map((job) => (
                <JobCard key={job.id} job={job} agent={state.agents.find((agent) => agent.id === job.agentId)} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em]">Top agents</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {topAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recent tx activity</CardTitle>
          </CardHeader>
          <CardContent>
            <TxList txs={recentTxs} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
