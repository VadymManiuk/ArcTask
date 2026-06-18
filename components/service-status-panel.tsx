"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, Database, RefreshCw, Server, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAddress } from "@/lib/utils";

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

function formatDate(value?: string) {
  if (!value) {
    return "unknown";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
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

  const queue = workerStatus?.status?.queue;
  const metrics = workerStatus?.status?.metrics;
  const managedAgents = workerStatus?.status?.managedAgents?.filter((agent) => agent.address) ?? [];
  const recentEvents = useMemo(() => workerStatus?.status?.recentEvents?.slice(0, 4) ?? [], [workerStatus]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Production runtime</p>
            <CardTitle className="mt-1">Autonomous service status</CardTitle>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            icon={workerStatus?.live ? CheckCircle2 : AlertTriangle}
            label="Worker"
            value={workerStatus?.live ? "Live" : "Offline"}
            detail={`heartbeat ${formatAge(workerStatus?.ageMs)}`}
            tone={workerStatus?.live ? "good" : "warn"}
          />
          <StatusTile
            icon={Users}
            label="Managed agents"
            value={managedAgents.length}
            detail={managedAgents.map((agent) => formatAddress(agent.address ?? "")).join(", ") || "none configured"}
          />
          <StatusTile
            icon={Activity}
            label="Jobs submitted"
            value={metrics?.jobsSubmitted ?? 0}
            detail={`${metrics?.ticks ?? 0} scans, ${metrics?.errors ?? 0} errors`}
          />
          <StatusTile
            icon={Database}
            label="Network jobs"
            value={networkJobs?.nextJobId ? Math.max(Number(networkJobs.nextJobId) - 1, 0) : "unknown"}
            detail={`${networkJobs?.count ?? 0} indexed in latest view`}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <Server className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Queue state
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <RuntimeKV label="Pending" value={queue?.pending ?? 0} />
              <RuntimeKV label="Locked" value={queue?.locked ?? 0} />
              <RuntimeKV label="Submitted last scan" value={queue?.submitted ?? 0} />
              <RuntimeKV label="Failed last scan" value={queue?.failed ?? 0} />
              <RuntimeKV label="Mode" value={workerStatus?.status?.mode ?? "unknown"} />
              <RuntimeKV label="Executor" value={workerStatus?.status?.executor ?? "unknown"} />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Started {formatDate(workerStatus?.status?.startedAt)}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-semibold">Recent worker events</p>
              {workerStatus?.source ? <span className="text-xs text-muted-foreground">{workerStatus.source}</span> : null}
            </div>
            {recentEvents.length > 0 ? (
              <div className="grid gap-2">
                {recentEvents.map((event, index) => (
                  <div key={`${event.createdAt}-${index}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate font-medium text-foreground">{event.type ?? "event"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatAge(Date.now() - Date.parse(event.createdAt ?? ""))}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {event.jobId ? `job ${event.jobId}` : "worker"} {event.worker ? `by ${formatAddress(event.worker)}` : ""}
                    </p>
                    {event.error ? <p className="mt-1 break-words text-xs text-rose-300">{event.error}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No worker events recorded yet</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeKV({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral"
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon
          className={`h-4 w-4 ${
            tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-cyan-300"
          }`}
          aria-hidden="true"
        />
        {label}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
