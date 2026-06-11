"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createJob } from "@/lib/store";
import type { Job, TxRecord } from "@/lib/types";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { isAddressLike } from "@/lib/utils";

export default function CreateJobPage() {
  const { agents } = useArcTaskState();
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
  const [created, setCreated] = useState<{ job: Job; tx: TxRecord } | null>(null);

  function onSubmit(event: FormEvent) {
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

    setIsSubmitting(true);
    window.setTimeout(() => {
      try {
        const result = createJob({
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
    }, 350);
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Create USDC-funded job</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mock mode creates a funded escrow record and fake Arcscan transaction.
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
              <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent">Select agent</Label>
              <Select id="agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                <option value="">Choose an agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
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
              <Label htmlFor="clientWallet">Client wallet address</Label>
              <Input id="clientWallet" placeholder="0x..." value={clientWallet} onChange={(event) => setClientWallet(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evaluatorWallet">Evaluator wallet address</Label>
              <Input id="evaluatorWallet" placeholder="0x..." value={evaluatorWallet} onChange={(event) => setEvaluatorWallet(event.target.value)} />
            </div>
            {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting || agents.length === 0}>
              {isSubmitting ? "Funding Escrow..." : "Fund Escrow"}
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
