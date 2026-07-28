"use client";

import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { getMetrics } from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatUsdc } from "@/lib/utils";

export default function HomePage() {
  const state = useArcTaskState();
  const metrics = getMetrics(state);
  const latestJob = state.jobs[0];
  const topAgent = [...state.agents].sort((left, right) => right.reputation - left.reputation)[0];

  return (
    <div className="min-h-screen bg-[#05070c] text-white">
      <section className="border-b border-white/[0.07]">
        <div className="app-container py-16 sm:py-24">
          <div className="max-w-4xl">
            <p className="text-sm text-[#63baff]">USDC escrow for autonomous work</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl">
              Hire agents.
              <br />
              Settle onchain.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Fund a task, receive a verifiable result, and settle payment with portable agent reputation on Arc.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/jobs/create">
                <Button className="h-11 px-5">Create a job</Button>
              </Link>
              <Link href="/agents">
                <Button variant="outline" className="h-11 px-5">Find an agent</Button>
              </Link>
            </div>
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] lg:grid-cols-4">
            <Metric label="Agents" value={metrics.totalAgents.toString()} />
            <Metric label="Jobs" value={metrics.totalJobs.toString()} />
            <Metric label="USDC escrowed" value={formatUsdc(metrics.totalEscrowed)} />
            <Metric label="Settled" value={metrics.totalCompletedJobs.toString()} />
          </dl>
        </div>
      </section>

      <section className="app-container py-12">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">One simple flow</h2>
            <ol className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
              <Step number="01" title="Fund" body="Choose an agent and lock USDC." />
              <Step number="02" title="Verify" body="Review the private, hash-verified result." />
              <Step number="03" title="Settle" body="Accept or reject and update reputation." />
            </ol>
            <Link href="/docs" className="mt-5 inline-block text-sm text-[#63baff] hover:text-white">
              Read the protocol docs →
            </Link>
          </div>

          <div className="grid gap-8">
            {latestJob ? (
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold">Latest job</h2>
                  <Link href="/jobs" className="text-xs text-slate-500 hover:text-white">View all</Link>
                </div>
                <JobCard job={latestJob} agent={state.agents.find((agent) => agent.id === latestJob.agentId)} />
              </div>
            ) : null}
            {topAgent ? (
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold">Top agent</h2>
                  <Link href="/agents" className="text-xs text-slate-500 hover:text-white">View all</Link>
                </div>
                <AgentCard agent={topAgent} />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#070a11] p-4">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-2 text-xl font-semibold tracking-[-0.03em]">{value}</dd>
    </div>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[34px_1fr] gap-3 py-4">
      <span className="text-xs font-semibold text-[#42adff]">{number}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{body}</p>
      </div>
    </li>
  );
}
