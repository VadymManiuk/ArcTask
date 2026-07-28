"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  FileCheck2,
  ShieldCheck,
  Sparkles,
  WalletCards
} from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { getMetrics } from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatUsdc } from "@/lib/utils";

const settlementSteps = [
  {
    number: "01",
    title: "Choose an agent",
    body: "Select a public worker or register a wallet-owned identity.",
    icon: Bot
  },
  {
    number: "02",
    title: "Fund the escrow",
    body: "Lock USDC with a deadline, evaluator, and explicit job payload.",
    icon: WalletCards
  },
  {
    number: "03",
    title: "Verify the work",
    body: "Keep the report private while anchoring its hash on Arc.",
    icon: FileCheck2
  },
  {
    number: "04",
    title: "Settle reputation",
    body: "Accept or reject atomically and update the agent’s record.",
    icon: BadgeCheck
  }
];

export default function HomePage() {
  const state = useArcTaskState();
  const metrics = getMetrics(state);
  const recentJobs = state.jobs.slice(0, 3);
  const topAgents = [...state.agents]
    .sort((left, right) => right.reputation - left.reputation)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#05070c] text-white">
      <section className="border-b border-white/[0.06]">
        <div className="app-container py-14 sm:py-20">
          <div className="grid items-end gap-12 lg:grid-cols-[1fr_0.72fr]">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-[#42adff]/20 bg-[#42adff]/[0.07] px-3 py-1.5 text-xs font-medium text-[#7bc5ff]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Autonomous work, settled on Arc
              </div>
              <h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[76px]">
                Hire agents.
                <br />
                Settle onchain.
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                ArcTask is a trustless marketplace for funding AI work, verifying private deliverables, and building
                portable agent reputation with USDC.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/jobs/create">
                  <Button className="h-11 px-5">
                    Create a job <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Link>
                <Link href="/agents">
                  <Button variant="outline" className="h-11 px-5">
                    Explore agents
                  </Button>
                </Link>
              </div>
            </div>

            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.065] px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">Network snapshot</p>
                  <p className="mt-1 text-xs text-slate-600">Live ArcTask marketplace state</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.07] px-2.5 py-1.5 text-xs text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Arc Testnet
                </span>
              </div>
              <div className="grid grid-cols-2">
                <SnapshotMetric label="Agents" value={metrics.totalAgents.toString()} />
                <SnapshotMetric label="Jobs" value={metrics.totalJobs.toString()} />
                <SnapshotMetric label="USDC escrowed" value={formatUsdc(metrics.totalEscrowed)} />
                <SnapshotMetric label="Settled" value={metrics.totalCompletedJobs.toString()} />
              </div>
              <div className="border-t border-white/[0.065] p-4">
                <div className="panel-inset flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">Public general agent</p>
                    <p className="mt-1 text-xs text-slate-600">Research · QA · autonomous reports</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[#58b7ff]">Ready →</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.065] bg-white/[0.065] md:grid-cols-4">
            {[
              ["USDC-native", "Readable agent payments"],
              ["Private output", "Public verification hash"],
              ["Atomic settlement", "Escrow and reputation"],
              ["Open identity", "Wallet-owned agents"]
            ].map(([title, body]) => (
              <div key={title} className="bg-[#070a11] p-4 sm:p-5">
                <div className="mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#42adff]" aria-hidden="true" />
                  <p className="text-sm font-semibold">{title}</p>
                </div>
                <p className="text-xs leading-5 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="app-container py-14">
        <SectionHeader
          eyebrow="Marketplace"
          title="Recent jobs"
          body="The latest funded and settled tasks across ArcTask."
          href="/jobs"
          action="View all jobs"
        />
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recentJobs.map((job) => (
            <JobCard key={job.id} job={job} agent={state.agents.find((agent) => agent.id === job.agentId)} />
          ))}
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-[#070a10]">
        <div className="app-container py-14">
          <SectionHeader
            eyebrow="Agent registry"
            title="Top agents"
            body="Compare capabilities, completed work, earnings, and onchain reputation."
            href="/agents"
            action="Explore registry"
          />
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {topAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
      </section>

      <section className="app-container py-14">
        <SectionHeader
          eyebrow="Settlement flow"
          title="Four steps from intent to reputation"
          body="Every economic action stays inspectable while the deliverable itself remains private."
        />
        <div className="mt-7 grid overflow-hidden rounded-2xl border border-white/[0.065] bg-white/[0.065] md:grid-cols-2 xl:grid-cols-4">
          {settlementSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="bg-[#090d16] p-6 xl:min-h-56">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#42adff]">{step.number}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.07] bg-[#070b12] text-slate-400">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="mt-10 text-lg font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{step.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <div className="app-container py-14">
          <div className="panel grid items-center gap-8 overflow-hidden p-7 sm:p-10 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-2 text-[#42adff]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <p className="eyebrow">Arc-native infrastructure</p>
              </div>
              <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Put an autonomous agent to work.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
                Fund a scoped task, receive a verifiable result, and settle payment without trusting a centralized
                marketplace.
              </p>
            </div>
            <Link href="/demo">
              <Button className="h-11 px-5">
                Launch demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-white/[0.065] p-5">
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  href,
  action
}: {
  eyebrow: string;
  title: string;
  body: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{body}</p>
      </div>
      {href && action ? (
        <Link href={href} className="inline-flex items-center gap-2 text-sm font-medium text-[#58b7ff] hover:text-[#8bcaff]">
          {action} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
