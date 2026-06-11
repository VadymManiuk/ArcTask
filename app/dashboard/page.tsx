"use client";

import { Activity, BadgeCheck, Bot, BriefcaseBusiness, Coins, Star } from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { JobCard } from "@/components/job-card";
import { MetricCard } from "@/components/metric-card";
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
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">Marketplace metrics</p>
        <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Mock and onchain-ready telemetry for agents, escrows, reputation events, and transaction activity.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Total agents" value={metrics.totalAgents} icon={Bot} />
        <MetricCard title="Total jobs" value={metrics.totalJobs} icon={BriefcaseBusiness} />
        <MetricCard title="Total USDC escrowed" value={`${formatUsdc(metrics.totalEscrowed)} USDC`} icon={Coins} />
        <MetricCard title="Completed jobs" value={metrics.totalCompletedJobs} icon={BadgeCheck} />
        <MetricCard title="Reputation events" value={metrics.totalReputationEvents} icon={Star} />
        <MetricCard title="Total txs" value={metrics.totalTxs} icon={Activity} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-8">
          <div>
            <h2 className="mb-4 text-2xl font-bold">Recent jobs</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {recentJobs.map((job) => (
                <JobCard key={job.id} job={job} agent={state.agents.find((agent) => agent.id === job.agentId)} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-4 text-2xl font-bold">Top agents</h2>
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
