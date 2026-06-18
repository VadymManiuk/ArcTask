"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
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
  const [capabilities, setCapabilities] = useState("research, code QA");
  const [ownerWallet, setOwnerWallet] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [metadataMode, setMetadataMode] = useState<"auto" | "custom">("auto");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadingWallet, setIsReadingWallet] = useState(false);
  const [created, setCreated] = useState<{ agent: Agent; tx: TxRecord } | null>(null);

  const metadataPreview = useMemo(
    () => ({
      schema: "arctask.agent.v1",
      name: name || "Agent name",
      description: description || "Agent description",
      capabilities: splitCapabilities(capabilities),
      ownerWallet: ownerWallet || "0x...",
      generatedAt: "on submit"
    }),
    [capabilities, description, name, ownerWallet]
  );
  const generatedMetadataUri = useMemo(
    () => `data:application/json,${encodeURIComponent(JSON.stringify(metadataPreview))}`,
    [metadataPreview]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }

    if (splitCapabilities(capabilities).length === 0) {
      setError("Add at least one capability.");
      return;
    }

    if (!isAddressLike(ownerWallet)) {
      setError("Enter a valid 0x wallet address.");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await registerAgentAction({
        name: name.trim(),
        description: description.trim(),
        capabilities: splitCapabilities(capabilities),
        ownerWallet,
        metadataUri: metadataMode === "custom" && metadataUri.trim() ? metadataUri.trim() : generatedMetadataUri
      });
      setCreated(result);
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
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Register AI agent</CardTitle>
          <p className="text-sm text-muted-foreground">
            Registers an ERC-8004-style identity on Arc Testnet and stores the demo profile locally.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Agent name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capabilities">Capabilities / skills</Label>
              <Input id="capabilities" value={capabilities} onChange={(event) => setCapabilities(event.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ownerWallet">Owner wallet address</Label>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                  disabled={isReadingWallet || isSubmitting}
                  onClick={fillConnectedWallet}
                >
                  {isReadingWallet ? "Reading wallet..." : "Use connected wallet"}
                </button>
              </div>
              <Input id="ownerWallet" placeholder="0x..." value={ownerWallet} onChange={(event) => setOwnerWallet(event.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <Label>Agent metadata</Label>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Generated automatically from the fields above. Use custom metadata only if you already have an IPFS,
                      HTTPS, or data URI.
                    </p>
                  </div>
                  <div className="flex shrink-0 rounded-md border border-white/10 bg-black/20 p-1">
                    <button
                      type="button"
                      className={`rounded px-3 py-1.5 text-sm font-semibold ${
                        metadataMode === "auto" ? "bg-white text-slate-950" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setMetadataMode("auto")}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      className={`rounded px-3 py-1.5 text-sm font-semibold ${
                        metadataMode === "custom" ? "bg-white text-slate-950" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setMetadataMode("custom")}
                    >
                      Custom
                    </button>
                  </div>
                </div>
                {metadataMode === "custom" ? (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="metadataUri">Custom metadata URI</Label>
                    <Input
                      id="metadataUri"
                      placeholder="ipfs://..., https://..., or data:application/json,..."
                      value={metadataUri}
                      onChange={(event) => setMetadataUri(event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                    <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Metadata will be generated and anchored automatically
                  </div>
                )}
              </div>
            </div>
            {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Confirm in wallet..." : "Register Agent"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Generated metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(metadataPreview, null, 2)}
            </pre>
          </CardContent>
        </Card>
        {created ? (
          <Card className="border-emerald-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Agent registered
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Agent ID: {created.agent.id}</p>
              <a href={created.tx.arcscanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                View transaction <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <div>
                <Link href={`/agents/${created.agent.id}`} className="font-semibold text-primary hover:underline">
                  Open agent profile
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
