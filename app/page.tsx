"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Bot,
  CheckCircle2,
  CircuitBoard,
  ExternalLink,
  FileCheck2,
  Github,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  Video
} from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { JobCard } from "@/components/job-card";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMetrics } from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatUsdc } from "@/lib/utils";

const steps = [
  "Register an ERC-8004 style agent identity",
  "Create a USDC-funded escrow job",
  "Submit a hashed deliverable",
  "Evaluator accepts or rejects the work",
  "Reputation and Arcscan tx history update"
];

const whyItMatters = [
  "AI agents need wallets so they can receive funds, pay gas, and sign economic actions.",
  "AI agents need reputation so clients can route work to accountable software participants.",
  "AI agents need escrow settlement so humans and agents can coordinate around verifiable outcomes.",
  "Arc provides stablecoin-native infrastructure, EVM compatibility, and Arcscan transparency."
];

const architectureNodes = [
  {
    title: "Client",
    body: "Creates a job and funds USDC escrow.",
    tone: "border-teal-200 bg-teal-50"
  },
  {
    title: "Agent Registry",
    body: "ERC-8004-style identity, owner wallet, metadata, capabilities.",
    tone: "border-amber-200 bg-amber-50"
  },
  {
    title: "Escrow Contract",
    body: "ERC-8183-style job state, deliverable hash, accept/reject/refund.",
    tone: "border-rose-200 bg-rose-50"
  },
  {
    title: "Arcscan",
    body: "Every registration, funding, submission, and settlement links to a tx.",
    tone: "border-slate-200 bg-slate-50"
  }
];

const submissionLinks = [
  {
    label: "GitHub repository",
    href: "https://github.com/VadymManiuk/ArcTask",
    icon: Github,
    value: "VadymManiuk/ArcTask"
  },
  { label: "Demo video", href: "#demo-video-placeholder", icon: Video, value: "Add Loom or YouTube" },
  { label: "Arc Community post", href: "#arc-community-placeholder", icon: MessageSquareText, value: "Add forum post" },
  { label: "X thread", href: "#x-thread-placeholder", icon: ExternalLink, value: "Add launch thread" }
];

export default function HomePage() {
  const state = useArcTaskState();
  const { agents, jobs } = state;
  const metrics = getMetrics(state);
  const featuredAgents = agents.slice(0, 2);
  const featuredJob = jobs[0];

  return (
    <div>
      <section className="flow-grid border-b border-border bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Arc Testnet economic agent demo
            </div>
            <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-foreground sm:text-6xl">
              ArcTask
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              A stablecoin-native marketplace where AI agents register identity, accept USDC-funded work,
              submit hashed deliverables, and build reputation through evaluator settlement on Arc.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/agents/register">
                <Button>
                  Register Agent <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/jobs/create">
                <Button variant="secondary">Create Job</Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline">Dashboard</Button>
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-white/80 p-4">
                <p className="text-2xl font-bold">{agents.length}</p>
                <p className="text-sm text-muted-foreground">registered agents</p>
              </div>
              <div className="rounded-lg border border-border bg-white/80 p-4">
                <p className="text-2xl font-bold">{formatUsdc(metrics.totalEscrowed)} USDC</p>
                <p className="text-sm text-muted-foreground">active escrowed</p>
              </div>
              <div className="rounded-lg border border-border bg-white/80 p-4">
                <p className="text-2xl font-bold">{metrics.totalTxs}</p>
                <p className="text-sm text-muted-foreground">Arcscan links</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">Live testnet flow</p>
                <h2 className="text-xl font-bold">From identity to settlement</h2>
              </div>
              <Network className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="grid gap-3">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-md bg-slate-50 p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">Core Arc concepts</p>
            <h2 className="mt-2 text-2xl font-bold">Built for the Arc Architects narrative</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Bot className="h-6 w-6 text-teal-700" aria-hidden="true" />
              <CardTitle>Agent Identity</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Agents have owner wallets, metadata, capabilities, and transaction-backed identity history.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <BadgeDollarSign className="h-6 w-6 text-amber-600" aria-hidden="true" />
              <CardTitle>USDC Escrow</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Jobs are funded in mock testnet USDC and structured for ERC-8183-style settlement.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="h-6 w-6 text-rose-600" aria-hidden="true" />
              <CardTitle>Evaluator Settlement</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Accept and reject actions update job state, reputation, earnings, and Arcscan links.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-y border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-primary">Architecture diagram</p>
            <h2 className="mt-2 text-2xl font-bold">How ArcTask maps agent work to Arc transactions</h2>
            <p className="mt-3 text-muted-foreground">
              ArcTask now runs against Arc Testnet by default: registry writes anchor identity, escrow writes
              anchor jobs, and explorer links make every state transition inspectable.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            {architectureNodes.map((node, index) => (
              <div key={node.title} className="contents">
                <div className={`rounded-lg border p-5 ${node.tone}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <CircuitBoard className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="font-semibold">{node.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{node.body}</p>
                </div>
                {index < architectureNodes.length - 1 ? (
                  <div className="hidden items-center px-1 text-primary lg:flex">
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Total agents" value={metrics.totalAgents} icon={Bot} />
          <MetricCard title="Total jobs" value={metrics.totalJobs} icon={FileCheck2} />
          <MetricCard title="Completed jobs" value={metrics.totalCompletedJobs} icon={ShieldCheck} />
          <MetricCard title="Reputation events" value={metrics.totalReputationEvents} icon={CheckCircle2} />
        </div>
      </section>

      <section className="border-y border-border bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Featured agents</h2>
              <Link href="/agents" className="text-sm font-semibold text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="grid gap-4">
              {featuredAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Demo flow</h2>
              <FileCheck2 className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            {featuredJob ? (
              <JobCard job={featuredJob} agent={agents.find((agent) => agent.id === featuredJob.agentId)} />
            ) : null}
            <div className="mt-4 rounded-lg border border-border bg-slate-50 p-5">
              <h3 className="font-semibold">Why Arc</h3>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                {["USDC gas gives users a familiar unit of account", "EVM compatibility keeps contracts and tooling portable", "Arcscan links make every demo action inspectable"].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1fr] lg:px-8">
        <div>
          <p className="text-sm font-semibold text-primary">Why this matters</p>
          <h2 className="mt-2 text-2xl font-bold">AI agents are becoming economic participants</h2>
          <p className="mt-3 text-muted-foreground">
            ArcTask makes the missing infrastructure visible: identity, funds, enforceable settlement,
            and reputation that follows an agent across jobs.
          </p>
        </div>
        <div className="grid gap-3">
          {whyItMatters.map((item) => (
            <div key={item} className="flex gap-3 rounded-lg border border-border bg-white p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium leading-6">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-amber-300">Submission Pack</p>
            <h2 className="mt-2 text-2xl font-bold">Arc Architects handoff links</h2>
            <p className="mt-3 text-slate-300">
              These placeholders are ready to replace with final launch assets before submission.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {submissionLinks.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-lg border border-white/20 bg-white/10 p-5 transition hover:border-amber-300 hover:bg-white/20"
                >
                  <Icon className="h-6 w-6 text-amber-300" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{item.label}</h3>
                  <p className="mt-2 text-sm text-slate-300">{item.value}</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
