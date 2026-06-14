"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, RotateCcw, Send, Wallet, X } from "lucide-react";
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
import { requestArcAccount } from "@/lib/wallet";

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
                error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {error || message}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Submit deliverable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Required signer: <span className="font-semibold text-foreground">{agentOwnerWallet ? formatAddress(agentOwnerWallet) : "Unknown agent owner"}</span>
              </p>
              <form className="space-y-4" onSubmit={onSubmitDeliverable}>
                <Textarea
                  disabled={!canSubmit}
                  value={deliverable}
                  onChange={(event) => setDeliverable(event.target.value)}
                  placeholder={canSubmit ? "Paste deliverable content to hash with keccak256" : "Deliverable submission is not available for this status"}
                />
                <Button type="submit" disabled={!canSubmit || Boolean(busyAction)}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "submit" ? "Hashing..." : "Submit Deliverable"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evaluator actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <p>
                  Accept/reject signer: <span className="font-semibold text-foreground">{formatAddress(job.evaluatorWallet)}</span>
                </p>
                <p>
                  Refund signer: <span className="font-semibold text-foreground">{formatAddress(job.clientWallet)}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={!canSettle || Boolean(busyAction)} onClick={() => handleAction("accept", () => acceptWorkAction(jobId), "Work accepted and escrow settled.")}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "accept" ? "Settling..." : "Accept Work"}
                </Button>
                <Button variant="danger" disabled={!canSettle || Boolean(busyAction)} onClick={() => handleAction("reject", () => rejectWorkAction(jobId), "Work rejected and reputation updated.")}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "reject" ? "Rejecting..." : "Reject Work"}
                </Button>
                <Button variant="outline" disabled={!canRefund || Boolean(busyAction)} onClick={() => handleAction("refund", () => refundJobAction(jobId), "Escrow refunded to client.")}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "refund" ? "Refunding..." : "Refund"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
                Required wallets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Button variant="outline" disabled={busyAction === "wallet"} onClick={checkConnectedWallet}>
                {busyAction === "wallet" ? "Checking..." : "Check connected wallet"}
              </Button>
              <Button
                variant="outline"
                disabled={!job.onchainJobId || Boolean(busyAction)}
                onClick={() => handleAction("sync", () => syncOnchainJobStateAction(jobId), "Onchain status synced.")}
              >
                {busyAction === "sync" ? "Syncing..." : "Sync onchain status"}
              </Button>
              {connectedWallet ? (
                <p className="break-all text-muted-foreground">
                  Connected: <span className="font-semibold text-foreground">{connectedWallet}</span>
                </p>
              ) : null}
              <div className="space-y-2">
                <p className={walletMatches(agentOwnerWallet) ? "font-semibold text-emerald-700" : "text-muted-foreground"}>
                  Submit deliverable: {agentOwnerWallet ?? "Unknown agent owner"}
                </p>
                <p className={walletMatches(job.evaluatorWallet) ? "font-semibold text-emerald-700" : "text-muted-foreground"}>
                  Accept/reject work: {job.evaluatorWallet}
                </p>
                <p className={walletMatches(job.clientWallet) ? "font-semibold text-emerald-700" : "text-muted-foreground"}>
                  Refund escrow: {job.clientWallet}
                </p>
              </div>
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
