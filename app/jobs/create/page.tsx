"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction } from "@/lib/store";
import type { Job, TxRecord } from "@/lib/types";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { isAddressLike } from "@/lib/utils";
import { requestArcAccount } from "@/lib/wallet";

export default function CreateJobPage() {
  const { agents } = useArcTaskState();
  const sortedAgents = useMemo(
    () =>
      [...agents].sort((left, right) => {
        const leftManaged = left.id === "agent-arctask-managed-worker" ? 1 : 0;
        const rightManaged = right.id === "agent-arctask-managed-worker" ? 1 : 0;
        return rightManaged - leftManaged || right.reputation - left.reputation;
      }),
    [agents]
  );
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [clientWallet, setClientWallet] = useState("");
  const [evaluatorWallet, setEvaluatorWallet] = useState("");
  const [rewardAmount, setRewardAmount] = useState("100");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletFillTarget, setWalletFillTarget] = useState<"" | "client" | "evaluator">("");
  const [created, setCreated] = useState<{ job: Job; tx: TxRecord } | null>(null);
  const selectedAgent = sortedAgents.find((agent) => agent.id === agentId);

  useEffect(() => {
    if (!agentId && sortedAgents.length > 0) {
      setAgentId(sortedAgents[0].id);
    }
  }, [agentId, sortedAgents]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const reward = Number(rewardAmount);
    if (!title.trim() || !description.trim() || !agentId || !deadline) {
      setError("Title, description, agent, and deadline are required.");
      return;
    }

    if (!Number.isFinite(reward) || reward <= 0) {
      setError("Reward must be greater than zero.");
      return;
    }

    if (!isAddressLike(clientWallet) || !isAddressLike(evaluatorWallet)) {
      setError("Client and evaluator must be valid 0x wallet addresses.");
      return;
    }

    if (deadline < today) {
      setError("Deadline cannot be in the past.");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await createJobAction({
        title: title.trim(),
        description: description.trim(),
        agentId,
        clientWallet,
        evaluatorWallet,
        rewardAmount: reward,
        deadline
      });
      setCreated(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Escrow funding failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function fillConnectedWallet(target: "client" | "evaluator") {
    setError("");
    try {
      setWalletFillTarget(target);
      const account = await requestArcAccount();
      if (target === "client") {
        setClientWallet(account);
      } else {
        setEvaluatorWallet(account);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection failed.");
    } finally {
      setWalletFillTarget("");
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl items-start gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Create USDC-funded job</CardTitle>
          <p className="text-sm text-muted-foreground">
            Funds an ERC-8183-style escrow job on Arc Testnet and stores the demo job locally.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="title">Job title</Label>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                className="min-h-32"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent">Select agent</Label>
              <Select id="agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                <option value="">Choose an agent</option>
                {sortedAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.id === "agent-arctask-managed-worker" ? " - public autonomous worker" : ""}
                  </option>
                ))}
              </Select>
              {selectedAgent ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedAgent.name}</span> will receive the funded
                  job. {selectedAgent.onchainAgentId ? `Onchain agent ID ${selectedAgent.onchainAgentId}.` : "Register this agent onchain before live jobs."}
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reward">Reward amount in USDC</Label>
                <Input id="reward" type="number" min="1" step="0.01" value={rewardAmount} onChange={(event) => setRewardAmount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  min={today}
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="clientWallet">Client wallet address</Label>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                  disabled={isSubmitting || Boolean(walletFillTarget)}
                  onClick={() => fillConnectedWallet("client")}
                >
                  {walletFillTarget === "client" ? "Reading wallet..." : "Use connected wallet"}
                </button>
              </div>
              <Input id="clientWallet" placeholder="0x..." value={clientWallet} onChange={(event) => setClientWallet(event.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="evaluatorWallet">Evaluator wallet address</Label>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                  disabled={isSubmitting || Boolean(walletFillTarget)}
                  onClick={() => fillConnectedWallet("evaluator")}
                >
                  {walletFillTarget === "evaluator" ? "Reading wallet..." : "Use connected wallet"}
                </button>
              </div>
              <Input id="evaluatorWallet" placeholder="0x..." value={evaluatorWallet} onChange={(event) => setEvaluatorWallet(event.target.value)} />
            </div>
            {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting || sortedAgents.length === 0}>
              {isSubmitting ? "Confirm in wallet..." : "Fund Escrow"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escrow state</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            New jobs start as <span className="font-semibold text-foreground">FUNDED</span>. The agent can submit a
            deliverable hash, then the evaluator accepts or rejects settlement.
          </p>
          {created ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Escrow funded
              </p>
              <p className="mt-2">Job ID: {created.job.id}</p>
              <a href={created.tx.arcscanUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                View transaction <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <div className="mt-3">
                <Link href={`/jobs/${created.job.id}`} className="font-semibold text-primary hover:underline">
                  Open job details
                </Link>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
