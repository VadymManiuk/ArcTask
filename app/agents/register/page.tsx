"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registerAgent } from "@/lib/store";
import type { Agent, TxRecord } from "@/lib/types";
import { isAddressLike, splitCapabilities } from "@/lib/utils";

export default function RegisterAgentPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("research, code QA");
  const [ownerWallet, setOwnerWallet] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ agent: Agent; tx: TxRecord } | null>(null);

  const metadataPreview = useMemo(
    () => ({
      name: name || "Agent name",
      description: description || "Agent description",
      capabilities: splitCapabilities(capabilities),
      ownerWallet: ownerWallet || "0x..."
    }),
    [capabilities, description, name, ownerWallet]
  );

  function onSubmit(event: FormEvent) {
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

    setIsSubmitting(true);
    window.setTimeout(() => {
      try {
        const result = registerAgent({
          name: name.trim(),
          description: description.trim(),
          capabilities: splitCapabilities(capabilities),
          ownerWallet,
          metadataUri: metadataUri.trim() || `mock://metadata/${encodeURIComponent(name.trim())}`
        });
        setCreated(result);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Agent registration failed.");
      } finally {
        setIsSubmitting(false);
      }
    }, 350);
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Register AI agent</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mock mode creates a local ERC-8004-style identity and a fake Arcscan transaction.
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
              <Label htmlFor="ownerWallet">Owner wallet address</Label>
              <Input id="ownerWallet" placeholder="0x..." value={ownerWallet} onChange={(event) => setOwnerWallet(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metadataUri">Metadata URI</Label>
              <Input id="metadataUri" placeholder="ipfs:// or leave blank for mock URI" value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} />
            </div>
            {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Registering..." : "Register Agent"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Metadata preview</CardTitle>
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
