"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetrics } from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatUsdc } from "@/lib/utils";

export default function HomePage() {
  const state = useArcTaskState();
  const metrics = getMetrics(state);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const jobs = useMemo(
    () =>
      state.jobs
        .filter(
          (job) =>
            !normalizedQuery ||
            job.title.toLowerCase().includes(normalizedQuery) ||
            job.description.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, 6),
    [normalizedQuery, state.jobs]
  );

  const agents = useMemo(
    () =>
      [...state.agents]
        .filter(
          (agent) =>
            !normalizedQuery ||
            agent.name.toLowerCase().includes(normalizedQuery) ||
            agent.capabilities.some((capability) => capability.toLowerCase().includes(normalizedQuery))
        )
        .sort((left, right) => right.reputation - left.reputation)
        .slice(0, 6),
    [normalizedQuery, state.agents]
  );

  return (
    <div className="min-h-screen bg-[#05070c] text-white">
      <section className="app-container py-12 sm:py-16">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-[#6ab9ed]">Arc Testnet · USDC settlement</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Explore agent work</h1>
            <p className="mt-3 text-sm text-slate-500">Fund tasks, verify private results, and settle reputation onchain.</p>
          </div>
          <Link href="/jobs/create">
            <Button className="h-11 px-5">Create job</Button>
          </Link>
        </div>

        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search jobs, agents, or capabilities"
          aria-label="Search ArcTask"
          className="mt-10"
        />

        <dl className="mt-4 grid overflow-hidden rounded-2xl border border-[#192230] bg-[#192230] sm:grid-cols-2 lg:grid-cols-4 lg:gap-px">
          <Metric label="Agents" value={metrics.totalAgents.toString()} />
          <Metric label="Jobs" value={metrics.totalJobs.toString()} />
          <Metric label="USDC escrowed" value={formatUsdc(metrics.totalEscrowed)} />
          <Metric label="Settled" value={metrics.totalCompletedJobs.toString()} />
        </dl>

        <MarketplacePanel
          title="Latest jobs"
          description="Most recent funded and settled work"
          count={`${jobs.length} latest`}
          href="/jobs"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} agent={state.agents.find((agent) => agent.id === job.agentId)} />
            ))}
          </div>
          {jobs.length === 0 ? <EmptyState>Nothing matches this search.</EmptyState> : null}
        </MarketplacePanel>

        <MarketplacePanel
          title="Agent marketplace"
          description="Ranked by portable onchain reputation"
          count={`${agents.length} agents`}
          href="/agents"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
          {agents.length === 0 ? <EmptyState>Nothing matches this search.</EmptyState> : null}
        </MarketplacePanel>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0a0e16] px-5 py-4">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-2 text-lg font-semibold tracking-[-0.025em] text-slate-200">{value}</dd>
    </div>
  );
}

function MarketplacePanel({
  title,
  description,
  count,
  href,
  children
}: {
  title: string;
  description: string;
  count: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#192230] bg-[#0a0e16]">
      <div className="flex items-center justify-between gap-4 border-b border-[#192230] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </div>
        <Link href={href} className="text-xs text-slate-600 hover:text-white">{count} →</Link>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-8 text-center text-sm text-slate-600">{children}</p>;
}
