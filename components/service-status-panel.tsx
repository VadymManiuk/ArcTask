"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkerStatusResponse {
  ok: boolean;
  live: boolean;
  source?: string;
  ageMs?: number | null;
  error?: string;
  status?: {
    startedAt?: string;
    updatedAt?: string;
    lastHeartbeatAt?: string;
    mode?: string;
    executor?: string;
    escrowAddress?: string;
    pollIntervalMs?: number;
    managedAgentCount?: number;
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
    recentEvents?: Array<{
      type?: string;
      jobId?: string;
      worker?: string;
      error?: string;
      createdAt?: string;
    }>;
    lastError?: string;
  };
}

interface NetworkJobsResponse {
  ok: boolean;
  error?: string;
  nextJobId?: string;
  count?: number;
  counts?: Record<string, number>;
  jobs?: Array<{
    onchainJobId: string;
    title: string;
    rewardDisplay: string;
    status: string;
    agentOwnerWallet: string;
  }>;
}

function formatAge(ageMs?: number | null) {
  if (ageMs === null || ageMs === undefined || !Number.isFinite(ageMs)) {
    return "unknown";
  }

  if (ageMs < 1_000) {
    return "just now";
  }

  const seconds = Math.round(ageMs / 1_000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  return `${Math.round(seconds / 60)}m ago`;
}

export function ServiceStatusPanel() {
  const [workerStatus, setWorkerStatus] = useState<WorkerStatusResponse | null>(null);
  const [networkJobs, setNetworkJobs] = useState<NetworkJobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const [workerResponse, jobsResponse] = await Promise.all([
        fetch("/api/worker/status", { cache: "no-store" }),
        fetch("/api/network/jobs?limit=50", { cache: "no-store" })
      ]);
      const workerBody = (await workerResponse.json().catch(() => ({}))) as WorkerStatusResponse;
      const jobsBody = (await jobsResponse.json().catch(() => ({}))) as NetworkJobsResponse;
      setWorkerStatus(workerBody);
      setNetworkJobs(jobsBody);
      if (!workerResponse.ok && !jobsResponse.ok) {
        throw new Error(workerBody.error ?? jobsBody.error ?? "Service status is unavailable");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Service status is unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    const interval = window.setInterval(() => void loadStatus(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = workerStatus?.status?.metrics;
  const managedAgentCount = workerStatus?.status?.managedAgentCount ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Worker status</CardTitle>
          <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.065] bg-white/[0.065] sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile
            label="Worker"
            value={workerStatus?.live ? "Live" : "Offline"}
            detail={`heartbeat ${formatAge(workerStatus?.ageMs)}`}
            tone={workerStatus?.live ? "good" : "warn"}
          />
          <StatusTile
            label="Managed agents"
            value={managedAgentCount}
            detail={workerStatus?.status?.mode ?? "unknown mode"}
          />
          <StatusTile
            label="Jobs submitted"
            value={metrics?.jobsSubmitted ?? 0}
            detail={`${metrics?.ticks ?? 0} scans, ${metrics?.errors ?? 0} errors`}
          />
          <StatusTile
            label="Network jobs"
            value={networkJobs?.nextJobId ? Math.max(Number(networkJobs.nextJobId) - 1, 0) : "unknown"}
            detail={`${networkJobs?.count ?? 0} indexed in latest view`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusTile({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="min-w-0 bg-[#060a11] p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            tone === "good" ? "bg-emerald-300" : tone === "warn" ? "bg-amber-300" : "bg-slate-600"
          }`}
          aria-hidden="true"
        />
        {label}
      </div>
      <p className="mt-2 truncate text-xl font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
