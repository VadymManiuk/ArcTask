import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAddress } from "@/lib/utils";

interface WorkerDeliverableFile {
  generatedAt?: unknown;
  deliverableHash?: unknown;
  txHash?: unknown;
  txUrl?: unknown;
  result?: {
    title?: unknown;
    mode?: unknown;
    model?: unknown;
    summary?: unknown;
  };
}

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

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function loadDeliverable(jobId: string): Promise<WorkerDeliverable | null> {
  if (!/^\d+$/.test(jobId)) {
    return null;
  }

  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(process.cwd(), ".agent-worker", "deliverables");
  try {
    const raw = await fs.readFile(path.join(outputDir, `job-${jobId}.json`), "utf8");
    const parsed = JSON.parse(raw) as WorkerDeliverableFile;

    return {
      jobId,
      generatedAt: asString(parsed.generatedAt),
      deliverableHash: asString(parsed.deliverableHash),
      txHash: asString(parsed.txHash),
      txUrl: asString(parsed.txUrl),
      title: asString(parsed.result?.title) ?? `Job ${jobId} deliverable`,
      mode: asString(parsed.result?.mode),
      model: asString(parsed.result?.model),
      summary: asString(parsed.result?.summary) ?? ""
    };
  } catch {
    const remoteBaseUrl = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
    if (!remoteBaseUrl) {
      return null;
    }

    const response = await fetch(new URL(`/api/deliverables/${jobId}`, remoteBaseUrl), { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { deliverable?: WorkerDeliverable };
    return body.deliverable ?? null;
  }
}

export default async function DeliverablePage({ params }: { params: { jobId: string } }) {
  const deliverable = await loadDeliverable(params.jobId);

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/jobs" className="text-sm font-semibold text-primary hover:underline">
        Back to jobs
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <p className="text-sm font-semibold text-primary">Onchain job #{params.jobId}</p>
          <CardTitle className="mt-2 text-3xl">{deliverable?.title ?? "Worker deliverable"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!deliverable ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Worker deliverable was not found on this deployment.
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
        </CardContent>
      </Card>
    </section>
  );
}
