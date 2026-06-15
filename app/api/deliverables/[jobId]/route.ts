import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function readLocalDeliverable(filePath: string, jobId: string) {
  const raw = await fs.readFile(filePath, "utf8");
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
}

async function fetchRemoteDeliverable(request: Request, jobId: string) {
  const remoteBaseUrl = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
  if (!remoteBaseUrl) {
    return null;
  }

  const remoteUrl = new URL(`/api/deliverables/${jobId}`, remoteBaseUrl);
  if (remoteUrl.origin === new URL(request.url).origin) {
    return null;
  }

  const response = await fetch(remoteUrl, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const jobId = params.jobId.trim();
  if (!/^\d+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(process.cwd(), ".agent-worker", "deliverables");
  const filePath = path.join(outputDir, `job-${jobId}.json`);

  try {
    return NextResponse.json({ deliverable: await readLocalDeliverable(filePath, jobId) });
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      const remoteDeliverable = await fetchRemoteDeliverable(request, jobId);
      if (remoteDeliverable) {
        return NextResponse.json(remoteDeliverable);
      }

      return NextResponse.json(
        {
          error:
            "Worker deliverable was not found on this deployment. It is available only where the agent worker writes .agent-worker/deliverables."
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: "Unable to read worker deliverable." }, { status: 500 });
  }
}
