"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAddress } from "@/lib/utils";
import { requestDeliverableAccessProof } from "@/lib/wallet";

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

function getFriendlyErrorMessage(message: string) {
  if (message.includes("Worker deliverable was not found")) {
    return "The private result is not available yet. If the agent submitted recently, wait a few seconds and try again.";
  }

  return message;
}

export function DeliverableViewer({ jobId }: { jobId: string }) {
  const [deliverable, setDeliverable] = useState<WorkerDeliverable | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function unlockDeliverable() {
    setError("");
    setLoading(true);
    try {
      const proof = await requestDeliverableAccessProof(jobId);

      const response = await fetch(`/api/deliverables/${encodeURIComponent(jobId)}`, {
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
        throw new Error(body.error ?? "Unable to load worker deliverable.");
      }

      setWalletAddress(proof.address);
      setDeliverable(body.deliverable);
    } catch (caught) {
      setDeliverable(null);
      setError(getFriendlyErrorMessage(caught instanceof Error ? caught.message : "Unable to unlock worker deliverable."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/jobs" className="text-sm font-semibold text-primary hover:underline">
        Back to jobs
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <p className="text-sm font-semibold text-primary">Onchain job #{jobId}</p>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <CardTitle className="text-3xl">{deliverable?.title ?? "Private work result"}</CardTitle>
            <Button type="button" disabled={loading} onClick={unlockDeliverable}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              {loading ? "Checking..." : deliverable ? "Refresh result" : "Unlock result"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {walletAddress ? (
            <p className="text-sm text-muted-foreground">
              Verified wallet: <span className="font-semibold text-foreground">{walletAddress}</span>
            </p>
          ) : null}

          {error ? (
            <div className="rounded-md border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100">
              {error}
            </div>
          ) : null}

          {!deliverable ? (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
              This report is private. Connect and sign with the wallet that created the job to view the worker output.
            </div>
          ) : (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Executor</dt>
                  <dd className="font-semibold">
                    {[deliverable.mode, deliverable.model].filter(Boolean).join(" / ") || "Worker"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Generated</dt>
                  <dd className="font-semibold">{deliverable.generatedAt ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Worker tx</dt>
                  <dd>
                    {deliverable.txUrl ? (
                      <a
                        href={deliverable.txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 break-all font-semibold text-primary hover:underline"
                      >
                        {deliverable.txHash ? formatAddress(deliverable.txHash) : "Open Arcscan"}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="font-semibold">Not recorded</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Deliverable hash</dt>
                  <dd className="break-all font-semibold">{deliverable.deliverableHash ?? "Not recorded"}</dd>
                </div>
              </dl>
              <pre className="max-h-[42rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-sm leading-6">
                {deliverable.summary || "The worker deliverable file did not include summary text."}
              </pre>
            </>
          )}

          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Waiting for wallet signature and access check...
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
