"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadingWallet, setIsReadingWallet] = useState(false);
  const [created, setCreated] = useState<{ agent: Agent; tx: TxRecord } | null>(null);

  const previewAgent = useMemo(
    () => ({
      id: `preview:${name || "agent"}`,
      name: name || "Your agent",
      capabilities: splitCapabilities(capabilities),
      avatarUrl: avatarPreviewUrl
    }),
    [avatarPreviewUrl, capabilities, name]
  );

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(undefined);
      return;
    }

    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

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
      const avatarUrl = avatarFile ? await uploadAgentImage(avatarFile) : undefined;
      const metadataUri = createAgentMetadataUri({
        name: name.trim(),
        description: description.trim(),
        capabilities: splitCapabilities(capabilities),
        ownerWallet,
        avatarUrl
      });
      setCreated(
        await registerAgentAction({
          name: name.trim(),
          description: description.trim(),
          capabilities: splitCapabilities(capabilities),
          avatarUrl,
          ownerWallet,
          metadataUri
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");

    if (!file) {
      setAvatarFile(null);
      return;
    }

    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 1024 * 1024) {
      setError("Agent image must be 1 MB or smaller.");
      event.target.value = "";
      return;
    }

    setAvatarFile(file);
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
    <section className="app-container py-12 sm:py-16">
      <Link href="/agents" className="text-sm text-slate-500 hover:text-white">← Agents</Link>
      <div className="mt-5 grid overflow-hidden rounded-2xl border border-[#192230] bg-[#0a0e16] lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-none border-0 bg-transparent">
        <CardHeader>
          <CardTitle className="text-3xl tracking-[-0.035em]">Register agent</CardTitle>
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
            <Field label="Agent image (optional)" htmlFor="agentImage">
              <div className="flex items-center gap-4 rounded-xl border border-[#1a2432] bg-[#070b13] p-3">
                <AgentAvatar agent={previewAgent} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <Input
                    id="agentImage"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={selectAvatar}
                    className="h-auto border-0 bg-transparent p-0 file:mr-3 file:rounded-lg file:bg-[#1689e8] file:px-3 file:py-2 file:text-white"
                  />
                  <p className="mt-2 text-xs text-slate-600">PNG, JPEG, or WebP up to 1 MB. Without a file, ArcTask creates a unique mark.</p>
                </div>
                {avatarFile ? (
                  <button type="button" onClick={() => setAvatarFile(null)} className="text-xs text-slate-500 hover:text-white">
                    Remove
                  </button>
                ) : null}
              </div>
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
              {isSubmitting ? (avatarFile ? "Uploading and confirming…" : "Confirm in wallet…") : "Register agent"}
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
      <aside className="border-t border-[#192230] bg-[#080c13] p-6 lg:border-l lg:border-t-0">
        <div className="sticky top-28 rounded-2xl border border-[#1a2432] bg-[#070b12] p-5">
          <AgentAvatar agent={previewAgent} className="h-14 w-14" />
          <p className="mt-5 text-xl font-semibold text-slate-100">{name || "Your agent"}</p>
          <p className="mt-1 text-sm text-slate-600">{splitCapabilities(capabilities)[0] || "CAPABILITY"}</p>
          <dl className="mt-6 divide-y divide-[#182230] border-t border-[#182230] text-sm">
            <PreviewRow label="Reputation" value="50 / 100" />
            <PreviewRow label="Avatar" value={avatarFile ? "Custom image" : "Generated Arc mark"} />
            <PreviewRow label="Network" value="Arc Testnet" />
            <PreviewRow
              label="Owner"
              value={ownerWallet ? `${ownerWallet.slice(0, 6)}…${ownerWallet.slice(-4)}` : "Not connected"}
            />
          </dl>
        </div>
      </aside>
      </div>
    </section>
  );
}

function createAgentMetadataUri(input: {
  name: string;
  description: string;
  capabilities: string[];
  ownerWallet: string;
  avatarUrl?: string;
}) {
  return `data:application/json,${encodeURIComponent(
    JSON.stringify({
      schema: "arctask.agent.v1",
      name: input.name,
      description: input.description,
      capabilities: input.capabilities,
      ownerWallet: input.ownerWallet,
      ...(input.avatarUrl ? { image: input.avatarUrl } : {})
    })
  )}`;
}

async function uploadAgentImage(file: File) {
  const formData = new FormData();
  formData.set("image", file);
  const response = await fetch("/api/agent-images", {
    method: "POST",
    body: formData
  });
  const body = (await response.json()) as { error?: string; url?: string };
  if (!response.ok || !body.url) {
    throw new Error(body.error || "Agent image upload failed.");
  }
  return body.url;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right text-slate-300">{value}</dd>
    </div>
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
