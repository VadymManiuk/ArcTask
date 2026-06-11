"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, RotateCcw, Send, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { TxList } from "@/components/tx-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { acceptWork, refundJob, rejectWork, submitDeliverable } from "@/lib/store";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { formatAddress, formatUsdc } from "@/lib/utils";

export default function JobDetailsPage() {
  const params = useParams<{ id: string }>();
  const { agents, jobs } = useArcTaskState();
  const job = jobs.find((item) => item.id === params.id);
  const agent = job ? agents.find((item) => item.id === job.agentId) : undefined;
  const [deliverable, setDeliverable] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string>("");

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

  function handleAction(actionName: string, action: () => void, success: string) {
    setError("");
    setMessage("");
    setBusyAction(actionName);
    window.setTimeout(() => {
      try {
        action();
        setMessage(success);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Action failed.");
      } finally {
        setBusyAction("");
      }
    }, 350);
  }

  function onSubmitDeliverable(event: FormEvent) {
    event.preventDefault();
    if (!deliverable.trim()) {
      setError("Deliverable content is required.");
      return;
    }

    handleAction("submit", () => submitDeliverable(jobId, deliverable.trim()), "Deliverable hash submitted.");
    setDeliverable("");
  }

  const canSubmit = job.status === "FUNDED";
  const canSettle = job.status === "SUBMITTED";
  const canRefund = job.status === "FUNDED" || job.status === "SUBMITTED";

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

          <Card>
            <CardHeader>
              <CardTitle>Submit deliverable</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmitDeliverable}>
                <Textarea
                  disabled={!canSubmit}
                  value={deliverable}
                  onChange={(event) => setDeliverable(event.target.value)}
                  placeholder={canSubmit ? "Paste deliverable content to hash with keccak256" : "Deliverable submission is not available for this status"}
                />
                <Button type="submit" disabled={!canSubmit || busyAction === "submit"}>
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
              <div className="flex flex-wrap gap-3">
                <Button disabled={!canSettle || Boolean(busyAction)} onClick={() => handleAction("accept", () => acceptWork(jobId), "Work accepted and escrow settled.")}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "accept" ? "Settling..." : "Accept Work"}
                </Button>
                <Button variant="danger" disabled={!canSettle || Boolean(busyAction)} onClick={() => handleAction("reject", () => rejectWork(jobId), "Work rejected and reputation updated.")}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "reject" ? "Rejecting..." : "Reject Work"}
                </Button>
                <Button variant="outline" disabled={!canRefund || Boolean(busyAction)} onClick={() => handleAction("refund", () => refundJob(jobId), "Escrow refunded to client.")}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {busyAction === "refund" ? "Refunding..." : "Refund"}
                </Button>
              </div>
              {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Arcscan activity</CardTitle>
          </CardHeader>
          <CardContent>
            <TxList txs={job.txHistory} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
