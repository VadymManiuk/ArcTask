"use client";

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
  const recentTxs = [
    ...state.jobs.flatMap((job) => job.txHistory),
    ...state.agents.flatMap((agent) => agent.txHistory)
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  return (
    <section className="app-container py-10 sm:py-12">
      <div className="mb-7">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">Network and worker status.</p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.065] bg-white/[0.065] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total agents" value={metrics.totalAgents} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total jobs" value={metrics.totalJobs} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Total USDC escrowed" value={`${formatUsdc(metrics.totalEscrowed)} USDC`} />
        <MetricCard className="rounded-none border-0 bg-[#090d16]" title="Completed jobs" value={metrics.totalCompletedJobs} />
      </div>

      <div className="mt-6">
        <ServiceStatusPanel />
      </div>

      <div className="mt-6">
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
