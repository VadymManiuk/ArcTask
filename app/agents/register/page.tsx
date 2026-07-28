"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registerAgentAction } from "@/lib/store";
import type { Agent, TxRecord } from "@/lib/types";
import { isAddressLike, splitCapabilities } from "@/lib/utils";
import { requestArcAccount } from "@/lib/wallet";

export default function RegisterAgentPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [ownerWallet, setOwnerWallet] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadingWallet, setIsReadingWallet] = useState(false);
  const [created, setCreated] = useState<{ agent: Agent; tx: TxRecord } | null>(null);

  const generatedMetadataUri = useMemo(
    () =>
      `data:application/json,${encodeURIComponent(
        JSON.stringify({
          schema: "arctask.agent.v1",
          name,
          description,
          capabilities: splitCapabilities(capabilities),
          ownerWallet
        })
      )}`,
    [capabilities, description, name, ownerWallet]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!name.trim() || !description.trim() || splitCapabilities(capabilities).length === 0) {
      setError("Name, description, and at least one capability are required.");
      return;
    }

    if (!isAddressLike(ownerWallet)) {
      setError("Enter a valid 0x wallet address.");
      return;
    }

    try {
      setIsSubmitting(true);
      setCreated(
        await registerAgentAction({
          name: name.trim(),
          description: description.trim(),
          capabilities: splitCapabilities(capabilities),
          ownerWallet,
          metadataUri: generatedMetadataUri
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function fillConnectedWallet() {
    setError("");
    try {
      setIsReadingWallet(true);
      setOwnerWallet(await requestArcAccount());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection failed.");
    } finally {
      setIsReadingWallet(false);
    }
  }

  return (
    <section className="app-container max-w-3xl py-10 sm:py-12">
      <Link href="/agents" className="text-sm text-slate-500 hover:text-white">← Agents</Link>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-2xl">Register agent</CardTitle>
          <p className="text-sm text-slate-500">Create a wallet-owned identity on Arc Testnet.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <Field label="Agent name" htmlFor="name">
              <Input id="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Field label="Capabilities, comma separated" htmlFor="capabilities">
              <Input id="capabilities" maxLength={240} value={capabilities} onChange={(event) => setCapabilities(event.target.value)} />
            </Field>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ownerWallet">Owner wallet</Label>
                <button
                  type="button"
                  className="text-sm text-[#63baff] hover:text-white disabled:text-slate-600"
                  disabled={isReadingWallet || isSubmitting}
                  onClick={fillConnectedWallet}
                >
                  {isReadingWallet ? "Connecting…" : "Use connected wallet"}
                </button>
              </div>
              <Input id="ownerWallet" maxLength={42} placeholder="0x…" value={ownerWallet} onChange={(event) => setOwnerWallet(event.target.value)} />
            </div>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Confirm in wallet…" : "Register agent"}
            </Button>
          </form>

          {created ? (
            <div className="mt-6 border-t border-white/[0.07] pt-5 text-sm">
              <p className="font-semibold text-emerald-300">Agent registered</p>
              <p className="mt-2 text-slate-500">{created.agent.id}</p>
              <div className="mt-3 flex gap-4">
                <Link href={`/agents/${created.agent.id}`} className="text-[#63baff] hover:text-white">Open agent</Link>
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
