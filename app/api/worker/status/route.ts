import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface WorkerStatus {
  service?: string;
  startedAt?: string;
  updatedAt?: string;
  lastHeartbeatAt?: string;
  mode?: string;
  executor?: string;
  escrowAddress?: string;
  pollIntervalMs?: number;
  maxJobsPerTick?: number;
  managedAgents?: Array<{ address?: string }>;
  queue?: {
    pending?: number;
    locked?: number;
    submitted?: number;
    skipped?: number;
    failed?: number;
  };
  metrics?: {
    ticks?: number;
    jobsScanned?: number;
    jobsSubmitted?: number;
    jobsSkipped?: number;
    errors?: number;
  };
  recentEvents?: Array<Record<string, unknown>>;
  lastError?: string;
}

function getStatusPath() {
  const stateDir = process.env.ARC_AGENT_STATE_DIR ?? path.join(process.cwd(), ".agent-worker", "state");
  return path.join(stateDir, "status.json");
}

function getAgeMs(status: WorkerStatus) {
  const timestamp = Date.parse(status.lastHeartbeatAt ?? status.updatedAt ?? "");
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Date.now() - timestamp;
}

async function readLocalStatus() {
  const raw = await fs.readFile(getStatusPath(), "utf8");
  return JSON.parse(raw) as WorkerStatus;
}

async function fetchRemoteStatus(request: Request) {
  const remoteBaseUrl = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
  if (!remoteBaseUrl) {
    return null;
  }

  const remoteUrl = new URL("/api/worker/status", remoteBaseUrl);
  if (remoteUrl.origin === new URL(request.url).origin) {
    return null;
  }

  const response = await fetch(remoteUrl, {
    cache: "no-store"
  });
  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

export async function GET(request: Request) {
  try {
    const status = await readLocalStatus();
    const ageMs = getAgeMs(status);

    return NextResponse.json({
      ok: true,
      source: "local",
      live: ageMs !== null && ageMs < 90_000,
      ageMs,
      status
    });
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      const remoteStatus = await fetchRemoteStatus(request);
      if (remoteStatus) {
        return NextResponse.json(remoteStatus);
      }

      return NextResponse.json(
        {
          ok: false,
          source: "local",
          live: false,
          error: "Worker status file was not found on this deployment"
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: false, live: false, error: "Unable to read worker status" }, { status: 500 });
  }
}
