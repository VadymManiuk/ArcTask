"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction } from "@/lib/store";
import type { Job, TxRecord } from "@/lib/types";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { getTodayDateInputValue, isAddressLike } from "@/lib/utils";
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
  const today = getTodayDateInputValue();
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
      setError("Complete all job fields.");
      return;
    }
    if (!Number.isFinite(reward) || reward <= 0) {
      setError("Reward must be greater than zero.");
      return;
    }
    if (!isAddressLike(clientWallet) || !isAddressLike(evaluatorWallet)) {
      setError("Client and evaluator must be valid wallet addresses.");
      return;
    }
    if (deadline < today) {
      setError("Deadline cannot be in the past.");
      return;
    }

    try {
      setIsSubmitting(true);
      setCreated(
        await createJobAction({
          title: title.trim(),
          description: description.trim(),
          agentId,
          clientWallet,
          evaluatorWallet,
          rewardAmount: reward,
          deadline
        })
      );
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
    <section className="app-container max-w-3xl py-10 sm:py-12">
      <Link href="/jobs" className="text-sm text-slate-500 hover:text-white">← Jobs</Link>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-2xl">Create job</CardTitle>
          <p className="text-sm text-slate-500">Choose an agent and fund the escrow in USDC.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <Field label="Title" htmlFor="title">
              <Input id="title" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Description and acceptance criteria" htmlFor="description">
              <Textarea id="description" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Field label="Agent" htmlFor="agent">
              <Select id="agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                <option value="">Choose an agent</option>
                {sortedAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reward, USDC" htmlFor="reward">
                <Input id="reward" type="number" min="1" step="0.01" value={rewardAmount} onChange={(event) => setRewardAmount(event.target.value)} />
              </Field>
              <Field label="Deadline" htmlFor="deadline">
                <Input id="deadline" type="date" min={today} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </Field>
            </div>
            <WalletField
              id="clientWallet"
              label="Client wallet"
              value={clientWallet}
              loading={walletFillTarget === "client"}
              disabled={isSubmitting || Boolean(walletFillTarget)}
              onChange={setClientWallet}
              onConnect={() => fillConnectedWallet("client")}
            />
            <WalletField
              id="evaluatorWallet"
              label="Evaluator wallet"
              value={evaluatorWallet}
              loading={walletFillTarget === "evaluator"}
              disabled={isSubmitting || Boolean(walletFillTarget)}
              onChange={setEvaluatorWallet}
              onConnect={() => fillConnectedWallet("evaluator")}
            />
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting || sortedAgents.length === 0}>
              {isSubmitting ? "Confirm in wallet…" : "Fund escrow"}
            </Button>
          </form>

          {created ? (
            <div className="mt-6 border-t border-white/[0.07] pt-5 text-sm">
              <p className="font-semibold text-emerald-300">Escrow funded</p>
              <p className="mt-2 text-slate-500">{created.job.id}</p>
              <div className="mt-3 flex gap-4">
                <Link href={`/jobs/${created.job.id}`} className="text-[#63baff] hover:text-white">Open job</Link>
                <a href={created.tx.arcscanUrl} target="_blank" rel="noreferrer" className="text-[#63baff] hover:text-white">Transaction</a>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function WalletField({
  id,
  label,
  value,
  loading,
  disabled,
  onChange,
  onConnect
}: {
  id: string;
  label: string;
  value: string;
  loading: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onConnect: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <button type="button" className="text-sm text-[#63baff] hover:text-white disabled:text-slate-600" disabled={disabled} onClick={onConnect}>
          {loading ? "Connecting…" : "Use connected wallet"}
        </button>
      </div>
      <Input id={id} maxLength={42} placeholder="0x…" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
