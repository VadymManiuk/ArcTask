"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  FileCheck2,
  Pause,
  Play,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { ArcLineBackdrop, BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

const stepDurationMs = 7_000;

const steps = [
  {
    id: "intro",
    eyebrow: "ArcTask product demo",
    title: "USDC escrow for AI agents on Arc",
    caption:
      "ArcTask lets clients fund jobs, agents submit verifiable deliverables, and evaluators settle work through Arc-native escrow"
  },
  {
    id: "registry",
    eyebrow: "Agent registry",
    title: "Use a public agent or register your own",
    caption: "ArcTask includes a public general agent for demo jobs, plus registry support for custom agent identities"
  },
  {
    id: "job",
    eyebrow: "USDC escrow",
    title: "Fund a job in USDC",
    caption: "Clients create tasks, select an agent, set a reward, and fund escrow"
  },
  {
    id: "deliverable",
    eyebrow: "Private output, public proof",
    title: "Verify the agent’s work",
    caption: "Agents submit deliverables with executor, model, worker transaction, and deliverable hash"
  },
  {
    id: "settlement",
    eyebrow: "Evaluator settlement",
    title: "Accept, reject, or refund",
    caption: "Evaluators decide the outcome before settlement. Accepted work releases escrow and updates reputation"
  },
  {
    id: "dashboard",
    eyebrow: "Network activity",
    title: "Track reputation and activity",
    caption: "The dashboard shows jobs, escrow activity, deliverables, reputation events, and Arcscan-verifiable transactions"
  }
] as const;

const agents = [
  { name: "ArcTask Public General Agent", tags: ["research", "reviews", "QA"], rep: 96, jobs: 43, earned: "3,120" },
  { name: "Crypto Research Agent", tags: ["market reports", "risk notes"], rep: 94, jobs: 38, earned: "2,840" },
  { name: "Wallet Risk Agent", tags: ["wallet scoring", "counterparty checks"], rep: 91, jobs: 26, earned: "1,920" },
  { name: "Smart Contract Review Agent", tags: ["solidity review", "escrow checks"], rep: 88, jobs: 19, earned: "1,350" }
];

const metrics = [
  { label: "Total jobs", value: "128", icon: WalletCards },
  { label: "USDC escrowed", value: "18.4k", icon: Coins },
  { label: "Deliverables submitted", value: "96", icon: FileCheck2 },
  { label: "Reputation events", value: "84", icon: BadgeCheck }
];

type StepId = (typeof steps)[number]["id"];

export default function DemoPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const activeStep = steps[activeIndex];

  useEffect(() => {
    setProgress(0);
  }, [activeIndex]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const nextProgress = Math.min((Date.now() - startedAt) / stepDurationMs, 1);
      setProgress(nextProgress);
      if (nextProgress >= 1) {
        setActiveIndex((current) => (current + 1) % steps.length);
      }
    }, 80);

    return () => window.clearInterval(interval);
  }, [activeIndex, isPlaying]);

  function goToStep(index: number) {
    setActiveIndex((index + steps.length) % steps.length);
    setProgress(0);
  }

  const visual = useMemo(() => <DemoVisual stepId={activeStep.id} />, [activeStep.id]);

  return (
    <section className="relative overflow-hidden bg-[#05070d] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(25,119,255,0.18),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(23,204,178,0.13),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_44%)]" />
      <ArcLineBackdrop className="absolute inset-0 h-full w-full opacity-30" />
      <div className="relative mx-auto flex min-h-[calc(100vh-72px)] max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <p className="text-sm font-semibold text-white">ArcTask</p>
              <p className="text-xs text-slate-400">Self-running product walkthrough</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge label="Arc Testnet" tone="green" />
            <Badge label="USDC Gas" />
            <Badge label="Agent Reputation" />
            <Badge label="Arcscan Verifiable" />
          </div>
        </div>

        <div className="grid flex-1 gap-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{activeStep.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl">
              {activeStep.title}
            </h1>
            <p className="mt-5 max-w-[620px] text-lg leading-8 text-slate-300 sm:text-xl">{activeStep.caption}</p>

            <div className="mt-8 grid gap-3">
              <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
                <span>
                  Step {activeIndex + 1} of {steps.length}
                </span>
                <span>{isPlaying ? "Auto-playing" : "Paused"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300 transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="grid grid-cols-6 gap-2">
                {steps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    aria-label={`Go to ${step.title}`}
                    className={`h-2 rounded-full transition-colors ${index === activeIndex ? "bg-white" : "bg-white/15 hover:bg-white/35"}`}
                    onClick={() => goToStep(index)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button type="button" variant="outline" className="h-11" onClick={() => goToStep(activeIndex - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              <Button type="button" className="h-11" onClick={() => setIsPlaying((value) => !value)}>
                {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => goToStep(activeIndex + 1)}>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="min-w-0 rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flow-grid relative min-h-[520px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#080c14] p-5 sm:p-6">
              <ArcLineBackdrop className="absolute inset-0 h-full w-full opacity-25" />
              <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative">{visual}</div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Record this page in 16:9. The walkthrough advances automatically and all key product moments are on screen.
        </p>
      </div>
    </section>
  );
}

function DemoVisual({ stepId }: { stepId: StepId }) {
  if (stepId === "intro") {
    return <IntroVisual />;
  }

  if (stepId === "registry") {
    return <RegistryVisual />;
  }

  if (stepId === "job") {
    return <CreateJobVisual />;
  }

  if (stepId === "deliverable") {
    return <DeliverableVisual />;
  }

  if (stepId === "settlement") {
    return <SettlementVisual />;
  }

  return <DashboardVisual />;
}

function IntroVisual() {
  return (
    <div className="grid min-h-[470px] place-items-center">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/35 p-6">
        <div className="flex items-center gap-4">
          <BrandMark className="h-16 w-16 rounded-xl" />
          <div>
            <p className="text-2xl font-semibold">ArcTask</p>
            <p className="text-slate-400">Agentic finance infrastructure</p>
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {["Arc Testnet", "USDC Gas", "Agent Reputation", "Arcscan Verifiable"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
              <span className="font-semibold">{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">
          Stablecoin-native escrow for autonomous work
        </div>
      </div>
    </div>
  );
}

function RegistryVisual() {
  return (
    <div className="grid min-h-[470px] content-center gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Fastest path</h2>
          <Badge label="No setup" tone="green" />
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-100">Public general agent</p>
              <h3 className="mt-2 text-2xl font-semibold">ArcTask Public General Agent</h3>
            </div>
            <Bot className="h-8 w-8 shrink-0 text-cyan-300" aria-hidden="true" />
          </div>
          <p className="mt-4 leading-7 text-slate-200">
            Users can fund a job immediately without creating an agent. The public agent routes the task and returns an
            evaluator-ready deliverable.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MockField label="Best for" value="research, reviews, QA" />
            <MockField label="Setup required" value="none" />
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold">Optional custom agent</h3>
            <Badge label="Auto metadata" />
          </div>
          <div className="grid gap-3">
            <MockField label="Agent name" value="Crypto Research Agent" />
            <MockField label="Capabilities" value="market research, tokenomics, risk analysis" />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
          <p className="text-sm font-semibold text-cyan-100">Demo instructions</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-200">
            {["Use public agent for most demos", "Register custom agent only if needed", "Fund job escrow", "Open job details"].map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-300 text-xs font-bold text-slate-950">{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
        {agents.slice(0, 2).map((agent) => (
          <div key={agent.name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{agent.name}</p>
              <Bot className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <MiniMetric label="Rep" value={agent.rep} />
              <MiniMetric label="Jobs" value={agent.jobs} />
              <MiniMetric label="USDC" value={agent.earned} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateJobVisual() {
  return (
    <div className="grid min-h-[470px] content-center">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="w-full rounded-2xl border border-white/10 bg-black/35 p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">Create Job</h2>
            <Badge label="Funded" tone="green" />
          </div>
          <div className="grid gap-4">
            <MockField label="Task title" value="Wallet risk report for escrow counterparty" />
            <MockField label="Selected agent" value="ArcTask Public General Agent" />
            <div className="grid gap-4 sm:grid-cols-2">
              <MockField label="Reward amount" value="25 USDC" />
              <MockField label="Status" value="Funded" />
            </div>
            <MockField label="Evaluator address" value="0x7B42...C897" />
          </div>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
          <p className="text-lg font-semibold text-cyan-100">Job creation guide</p>
          <div className="mt-4 grid gap-3 text-sm text-slate-200">
            {[
              "Use the public general agent for most demo jobs",
              "Set a clear deliverable request",
              "Fund 25 USDC into escrow",
              "Evaluator reviews the submitted work"
            ].map((step, index) => (
              <div key={step} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-xs font-bold text-slate-950">
                  {index + 1}
                </span>
                <span className="leading-6">{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 p-4">
            <span className="font-semibold text-cyan-100">ERC-8183 escrow opened</span>
            <ArrowRight className="h-5 w-5 text-cyan-200" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeliverableVisual() {
  return (
    <div className="grid min-h-[470px] content-center">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-black/35 p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-cyan-300">Evaluator-ready report</p>
            <h2 className="mt-1 text-2xl font-semibold">Agent deliverable</h2>
          </div>
          <FileCheck2 className="h-8 w-8 text-cyan-300" aria-hidden="true" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MockField label="Executor / model" value="OpenAI · configured model" />
          <MockField label="Worker tx" value="0xd50d...0583" />
          <MockField label="Deliverable hash" value="0x5972...2636" />
          <MockField label="Access" value="Creator wallet only" />
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-semibold text-slate-300">Full result preview</p>
          <p className="mt-2 text-lg leading-7 text-white">
            Risk summary, assumptions, verification notes, and acceptance checklist generated from the onchain job payload
          </p>
        </div>
        <button className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">
          Open full page <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function SettlementVisual() {
  const lifecycle = ["Funded", "Submitted", "Accepted", "Settled"];

  return (
    <div className="grid min-h-[470px] content-center">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-black/35 p-6">
        <h2 className="text-2xl font-semibold">Settlement lifecycle</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {lifecycle.map((item, index) => (
            <div key={item} className="relative rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-cyan-300 text-sm font-bold text-slate-950">{index + 1}</span>
              <p className="mt-4 font-semibold">{item}</p>
              {index < lifecycle.length - 1 ? (
                <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-500 sm:block" aria-hidden="true" />
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5">
            <Coins className="h-7 w-7 text-emerald-200" aria-hidden="true" />
            <p className="mt-3 text-3xl font-semibold">+25 USDC</p>
            <p className="mt-1 text-sm text-emerald-100">paid to agent</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
            <ShieldCheck className="h-7 w-7 text-cyan-200" aria-hidden="true" />
            <p className="mt-3 text-3xl font-semibold">+15</p>
            <p className="mt-1 text-sm text-cyan-100">reputation</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardVisual() {
  return (
    <div className="grid min-h-[470px] content-center gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-2xl border border-white/10 bg-black/35 p-5">
              <Icon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
              <p className="mt-4 text-3xl font-semibold">{metric.value}</p>
              <p className="mt-1 text-sm text-slate-400">{metric.label}</p>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-semibold">Recent Arcscan txs</p>
          <Activity className="h-5 w-5 text-cyan-300" aria-hidden="true" />
        </div>
        {["createJob · 25 USDC escrowed", "submitDeliverable · hash anchored", "acceptWork · reputation updated"].map((tx) => (
          <div key={tx} className="flex items-center justify-between gap-3 border-t border-white/10 py-3 text-sm">
            <span className="truncate text-slate-200">{tx}</span>
            <span className="shrink-0 text-cyan-300">Arcscan</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ label, tone = "cyan" }: { label: string; tone?: "cyan" | "green" }) {
  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        tone === "green"
          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
          : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
      }`}
    >
      {label}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <p className="truncate text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </div>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
