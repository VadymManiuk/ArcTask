"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Clock, ExternalLink, FileText, RefreshCw, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { TxList } from "@/components/tx-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptWorkAction,
  refundJobAction,
  rejectWorkAction,
  submitDeliverableAction,
  syncOnchainJobStateAction
} from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatAddress, formatUsdc } from "@/lib/utils";
import { requestArcAccount, requestDeliverableAccessProof } from "@/lib/wallet";
import type { JobStatus } from "@/lib/types";

interface WorkerDeliverable {
  jobId: string;
  generatedAt?: string;
  deliverableHash?: string;
  txHash?: string;
  txUrl?: string;
  title: string;
  mode?: string;
  model?: string;
  summary: string;
}

const workerPollSeconds = 15;

const statusSteps: Array<{ key: "funded" | "submitted" | "review" | "settled"; label: string }> = [
  { key: "funded", label: "Escrow funded" },
  { key: "submitted", label: "Agent submitted" },
  { key: "review", label: "Evaluator review" },
  { key: "settled", label: "Settled" }
];

function getDeadlineMs(deadline: string) {
  const parsed = Date.parse(`${deadline}T23:59:59`);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getTimeLeft(deadline: string, nowMs: number) {
  const deadlineMs = getDeadlineMs(deadline);
  if (deadlineMs === null) {
    return "Unknown";
  }

  const remainingMs = deadlineMs - nowMs;
  return remainingMs <= 0 ? "Expired" : formatDuration(remainingMs);
}

function getStepState(status: JobStatus, step: (typeof statusSteps)[number]["key"]) {
  const completedByStatus: Record<JobStatus, string[]> = {
    FUNDED: ["funded"],
    SUBMITTED: ["funded", "submitted"],
    ACCEPTED: ["funded", "submitted", "review", "settled"],
    REJECTED: ["funded", "submitted", "review"],
    REFUNDED: ["funded", "settled"]
  };
  const activeByStatus: Record<JobStatus, string> = {
    FUNDED: "submitted",
    SUBMITTED: "review",
    ACCEPTED: "settled",
    REJECTED: "settled",
    REFUNDED: "settled"
  };

  if (completedByStatus[status].includes(step)) {
    return "complete";
  }

  return activeByStatus[status] === step ? "active" : "waiting";
}

function getStatusText(status: JobStatus) {
  switch (status) {
    case "FUNDED":
      return "The job is funded. The autonomous worker scans Arc Testnet and should pick it up shortly.";
    case "SUBMITTED":
      return "The agent submitted a deliverable hash. Unlock the private result, then accept or reject the work.";
    case "ACCEPTED":
      return "The evaluator accepted the work. Escrow is settled and reputation is updated.";
    case "REJECTED":
      return "The evaluator rejected the work. Escrow was returned according to the rejection flow.";
    case "REFUNDED":
      return "The job was refunded to the client.";
  }
}

function getDeliverableErrorMessage(error: string) {
  if (error.includes("Worker deliverable was not found")) {
    return "The private result is not available yet. If the onchain status was just updated, wait a few seconds and refresh status.";
  }

  return error;
}

export default function JobDetailsPage() {
  const params = useParams<{ id: string }>();
  const { agents, jobs } = useArcTaskState();
  const job = jobs.find((item) => item.id === params.id);
  const agent = job ? agents.find((item) => item.id === job.agentId) : undefined;
  const [deliverable, setDeliverable] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string>("");
  const [connectedWallet, setConnectedWallet] = useState("");
  const [workerDeliverable, setWorkerDeliverable] = useState<WorkerDeliverable | null>(null);
  const [deliverableLoading, setDeliverableLoading] = useState(false);
  const [deliverableError, setDeliverableError] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadWorkerDeliverable = useCallback(async () => {
    if (!job?.onchainJobId) {
      setWorkerDeliverable(null);
      setDeliverableError("This job does not have an onchain job ID.");
      return;
    }

    setDeliverableLoading(true);
    setDeliverableError("");
    try {
      const proof = await requestDeliverableAccessProof(job.onchainJobId);
      setConnectedWallet(proof.address);

      const response = await fetch(`/api/deliverables/${encodeURIComponent(job.onchainJobId)}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(proof)
      });
      const body = (await response.json().catch(() => ({}))) as {
        deliverable?: WorkerDeliverable;
        error?: string;
      };

      if (!response.ok || !body.deliverable) {
        throw new Error(body.error ?? "Worker deliverable is not available yet.");
      }

      setWorkerDeliverable(body.deliverable);
    } catch (caught) {
      setWorkerDeliverable(null);
      setDeliverableError(getDeliverableErrorMessage(caught instanceof Error ? caught.message : "Worker deliverable is not available yet."));
    } finally {
      setDeliverableLoading(false);
    }
  }, [job?.onchainJobId]);

  if (!job) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Card>
          <CardContent className="p-6">
            <p className="font-semibold">Job not found.</p>
            <Link href="/jobs" className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">
              Back to jobs
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  const jobId = job.id;

  async function handleAction(actionName: string, action: () => Promise<unknown>, success: string, onSuccess?: () => void) {
    setError("");
    setMessage("");
    setBusyAction(actionName);
    try {
      await action();
      onSuccess?.();
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusyAction("");
    }
  }

  function onSubmitDeliverable(event: FormEvent) {
    event.preventDefault();
    if (busyAction) {
      return;
    }

    if (!deliverable.trim()) {
      setError("Deliverable content is required.");
      return;
    }

    handleAction(
      "submit",
      () => submitDeliverableAction(jobId, deliverable.trim()),
      "Deliverable hash submitted.",
      () => setDeliverable("")
    );
  }

  const canSubmit = job.status === "FUNDED";
  const canSettle = job.status === "SUBMITTED";
  const canRefund = job.status === "FUNDED" || job.status === "SUBMITTED";
  const agentOwnerWallet = agent?.ownerWallet;
  const timeLeft = getTimeLeft(job.deadline, nowMs);
  const canUnlockDeliverable = Boolean(job.onchainJobId && ["SUBMITTED", "ACCEPTED", "REJECTED"].includes(job.status));

  function walletMatches(expected?: string) {
    return Boolean(connectedWallet && expected && connectedWallet.toLowerCase() === expected.toLowerCase());
  }

  async function checkConnectedWallet() {
    setError("");
    setMessage("");
    try {
      setBusyAction("wallet");
      setConnectedWallet(await requestArcAccount());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection failed.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/jobs" className="text-sm font-semibold text-primary hover:underline">
        Back to jobs
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-primary">{job.id}</p>
                  <CardTitle className="mt-2 text-3xl">{job.title}</CardTitle>
                </div>
                <StatusBadge status={job.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-muted-foreground">{job.description}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Reward</dt>
                  <dd className="font-semibold">{formatUsdc(job.rewardAmount)} USDC</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Deadline</dt>
                  <dd className="font-semibold">{job.deadline}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Agent</dt>
                  <dd className="font-semibold">{agent?.name ?? "Unknown agent"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Onchain job ID</dt>
                  <dd className="font-semibold">{job.onchainJobId ?? "Mock only"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Client</dt>
                  <dd className="font-semibold">{formatAddress(job.clientWallet)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Evaluator</dt>
                  <dd className="font-semibold">{formatAddress(job.evaluatorWallet)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Deliverable hash</dt>
                  <dd className="break-all font-semibold">{job.deliverableHash ?? "Not submitted"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {message || error ? (
            <div
              className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                error
                  ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
                  : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              }`}
            >
              {error || message}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
                Job progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-muted-foreground">Current status</p>
                  <p className="mt-1 font-semibold text-foreground">{job.status}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-muted-foreground">Time left</p>
                  <p className={timeLeft === "Expired" ? "mt-1 font-semibold text-rose-300" : "mt-1 font-semibold text-foreground"}>
                    {timeLeft}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-muted-foreground">Worker check</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {job.status === "FUNDED" ? `about every ${workerPollSeconds}s` : "complete"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                {statusSteps.map((step, index) => {
                  const state = getStepState(job.status, step.key);
                  return (
                    <div
                      key={step.key}
                      className={`rounded-lg border p-3 text-sm ${
                        state === "complete"
                          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                          : state === "active"
                            ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                            : "border-white/10 bg-white/[0.03] text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full border border-current text-xs font-semibold">
                          {state === "complete" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                        </span>
                        <span className="font-semibold">{step.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-sm leading-6 text-muted-foreground">{getStatusText(job.status)}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant={job.status === "FUNDED" ? "primary" : "outline"}
                  disabled={!job.onchainJobId || Boolean(busyAction)}
                  onClick={() => handleAction("sync", () => syncOnchainJobStateAction(jobId), "Status refreshed from Arc Testnet.")}
                >
                  <RefreshCw className={`h-4 w-4 ${busyAction === "sync" ? "animate-spin" : ""}`} aria-hidden="true" />
                  {busyAction === "sync" ? "Refreshing..." : "Refresh status"}
                </Button>
                {canSettle ? (
                  <>
                    <Button disabled={Boolean(busyAction)} onClick={() => handleAction("accept", () => acceptWorkAction(jobId), "Work accepted and escrow settled.")}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {busyAction === "accept" ? "Settling..." : "Accept work"}
                    </Button>
                    <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => handleAction("reject", () => rejectWorkAction(jobId), "Work rejected and reputation updated.")}>
                      <X className="h-4 w-4" aria-hidden="true" />
                      {busyAction === "reject" ? "Rejecting..." : "Reject"}
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                  Work result
                </CardTitle>
                {canUnlockDeliverable ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deliverableLoading}
                    onClick={() => void loadWorkerDeliverable()}
                  >
                    <RefreshCw className={`h-4 w-4 ${deliverableLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                    {deliverableLoading ? "Checking..." : workerDeliverable ? "Refresh result" : "Unlock result"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!job.onchainJobId ? (
                <p className="text-sm text-muted-foreground">This is a local demo job. Onchain worker results are available for Arc Testnet jobs.</p>
              ) : job.status === "FUNDED" ? (
                <div className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-4 py-4 text-sm text-cyan-100">
                  The agent is still working. Refresh status in a few seconds to see when the deliverable hash is submitted.
                </div>
              ) : deliverableError ? (
                <div className="rounded-md border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100">
                  {deliverableError}
                </div>
              ) : workerDeliverable ? (
                <div className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Executor</p>
                      <p className="font-semibold">
                        {[workerDeliverable.mode, workerDeliverable.model].filter(Boolean).join(" / ") || "Worker"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Worker tx</p>
                      {workerDeliverable.txUrl ? (
                        <a
                          href={workerDeliverable.txUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 break-all font-semibold text-primary hover:underline"
                        >
                          {workerDeliverable.txHash ? formatAddress(workerDeliverable.txHash) : "Open Arcscan"}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <p className="font-semibold">Not recorded</p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground">Deliverable hash</p>
                      <p className="break-all font-semibold">{workerDeliverable.deliverableHash ?? "Not recorded"}</p>
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40">
                    <div className="border-b border-border px-4 py-3">
                      <p className="font-semibold">{workerDeliverable.title}</p>
                    </div>
                    <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-foreground">
                      {workerDeliverable.summary || "The worker deliverable file did not include summary text."}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The result is private. Unlock it with the job creator wallet after the agent submits work.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-muted-foreground">Next step</p>
                <p className="mt-1 font-semibold text-foreground">
                  {job.status === "FUNDED"
                    ? "Wait for the agent to submit work"
                    : job.status === "SUBMITTED"
                      ? "Review and settle the result"
                      : "No action needed"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-muted-foreground">Deadline</p>
                <p className="mt-1 font-semibold text-foreground">{job.deadline}</p>
                <p className="mt-1 text-muted-foreground">{timeLeft === "Expired" ? "Deadline reached" : `${timeLeft} remaining`}</p>
              </div>

              <details className="rounded-lg border border-white/10 bg-white/[0.03]">
                <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-200">Advanced controls</summary>
                <div className="space-y-5 border-t border-white/10 p-4">
                  <div className="space-y-3">
                    <p className="text-muted-foreground">
                      Use these only for manual testing, debugging, or evaluator settlement.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" disabled={busyAction === "wallet"} onClick={checkConnectedWallet}>
                        {busyAction === "wallet" ? "Checking..." : "Check wallet"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!job.onchainJobId || Boolean(busyAction)}
                        onClick={() => handleAction("sync", () => syncOnchainJobStateAction(jobId), "Status refreshed from Arc Testnet.")}
                      >
                        {busyAction === "sync" ? "Refreshing..." : "Refresh onchain"}
                      </Button>
                    </div>
                    {connectedWallet ? (
                      <p className="break-all text-muted-foreground">
                        Connected: <span className="font-semibold text-foreground">{connectedWallet}</span>
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <p className={walletMatches(agentOwnerWallet) ? "font-semibold text-emerald-300" : "text-muted-foreground"}>
                        Agent owner: {agentOwnerWallet ?? "Unknown"}
                      </p>
                      <p className={walletMatches(job.evaluatorWallet) ? "font-semibold text-emerald-300" : "text-muted-foreground"}>
                        Evaluator: {job.evaluatorWallet}
                      </p>
                      <p className={walletMatches(job.clientWallet) ? "font-semibold text-emerald-300" : "text-muted-foreground"}>
                        Client: {job.clientWallet}
                      </p>
                    </div>
                  </div>

                  <form className="space-y-3" onSubmit={onSubmitDeliverable}>
                    <p className="font-semibold text-slate-200">Manual deliverable submit</p>
                    <Textarea
                      disabled={!canSubmit}
                      maxLength={20000}
                      value={deliverable}
                      onChange={(event) => setDeliverable(event.target.value)}
                      placeholder={canSubmit ? "Manual test only. Normal jobs are handled by the worker." : "Manual submit is not available for this status"}
                    />
                    <Button type="submit" variant="outline" disabled={!canSubmit || Boolean(busyAction)}>
                      <Send className="h-4 w-4" aria-hidden="true" />
                      {busyAction === "submit" ? "Hashing..." : "Submit manually"}
                    </Button>
                  </form>

                  <div className="space-y-3">
                    <p className="font-semibold text-slate-200">Manual settlement</p>
                    <div className="flex flex-wrap gap-3">
                      <Button disabled={!canSettle || Boolean(busyAction)} onClick={() => handleAction("accept", () => acceptWorkAction(jobId), "Work accepted and escrow settled.")}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {busyAction === "accept" ? "Settling..." : "Accept"}
                      </Button>
                      <Button variant="danger" disabled={!canSettle || Boolean(busyAction)} onClick={() => handleAction("reject", () => rejectWorkAction(jobId), "Work rejected and reputation updated.")}>
                        <X className="h-4 w-4" aria-hidden="true" />
                        {busyAction === "reject" ? "Rejecting..." : "Reject"}
                      </Button>
                      <Button variant="outline" disabled={!canRefund || Boolean(busyAction)} onClick={() => handleAction("refund", () => refundJobAction(jobId), "Escrow refunded to client.")}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        {busyAction === "refund" ? "Refunding..." : "Refund"}
                      </Button>
                    </div>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Arcscan activity</CardTitle>
            </CardHeader>
            <CardContent>
              <TxList txs={job.txHistory} />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
