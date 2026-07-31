"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useArcTaskState } from "@/lib/use-arctask-state";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: Array<"ALL" | JobStatus> = ["ALL", "FUNDED", "SUBMITTED", "ACCEPTED", "DISPUTED", "REJECTED", "REFUNDED"];
const filterLabels: Record<(typeof filters)[number], string> = {
  ALL: "All",
  FUNDED: "Funded",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  DISPUTED: "Disputed",
  REJECTED: "Rejected",
  REFUNDED: "Refunded"
};

type JobSort = "newest" | "reward" | "deadline";

export default function JobsPage() {
  const { agents, jobs, isLoading, syncError, refresh } = useArcTaskState();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<JobSort>("newest");

  const statusCounts = useMemo(
    () => {
      const counts: Record<string, number> = { ALL: jobs.length };
      jobs.forEach((job) => {
        counts[job.status] = (counts[job.status] ?? 0) + 1;
      });
      return counts;
    },
    [jobs]
  );

  const filteredJobs = useMemo(
    () =>
      jobs
        .filter((job) => {
          const matchesStatus = filter === "ALL" || job.status === filter;
          const normalizedQuery = query.trim().toLowerCase();
          const matchesQuery =
            !normalizedQuery ||
            job.title.toLowerCase().includes(normalizedQuery) ||
            job.description.toLowerCase().includes(normalizedQuery);
          return matchesStatus && matchesQuery;
        })
        .sort((left, right) => {
          if (sort === "reward") return right.rewardAmount - left.rewardAmount;
          if (sort === "deadline") return Date.parse(left.deadline) - Date.parse(right.deadline);
          return Date.parse(right.createdAt) - Date.parse(left.createdAt);
        }),
    [filter, jobs, query, sort]
  );

  return (
    <section className="app-container py-12 sm:py-16">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow mb-3">Job marketplace</p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em]">Find work on Arc</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Browse funded tasks, compare rewards, and track work from escrow to settlement.</p>
        </div>
        <Link href="/jobs/create">
          <Button>Create job</Button>
        </Link>
      </div>

      <div className="mb-7 rounded-2xl border border-[#192230] bg-[#080c14] p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or task details"
            aria-label="Search jobs"
          />
          <Select value={sort} onChange={(event) => setSort(event.target.value as JobSort)} aria-label="Sort jobs">
            <option value="newest">Newest first</option>
            <option value="reward">Highest reward</option>
            <option value="deadline">Deadline soonest</option>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 rounded-full border border-transparent px-3 py-2 text-xs font-medium text-slate-500 transition hover:text-white",
                filter === item && "border-[#29445c] bg-[#0d1a27] text-[#8fd1fb]"
              )}
            >
              {filterLabels[item]} <span className="ml-1 text-[10px] opacity-60">{statusCounts[item] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Available jobs</h2>
        <span className="text-xs text-slate-600">{filteredJobs.length} results</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading && jobs.length === 0
          ? [0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[260px] animate-pulse rounded-[18px] border border-white/[0.075] bg-[#080c14]"
              />
            ))
          : null}
        {filteredJobs.map((job) => (
          <JobCard key={job.id} job={job} agent={agents.find((agent) => agent.id === job.agentId)} />
        ))}
      </div>
      {syncError ? (
        <div className="mt-3 flex flex-col items-start justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100 sm:flex-row sm:items-center">
          <span>
            {jobs.length > 0
              ? "Showing the last confirmed data. Live refresh is temporarily unavailable."
              : "Arc Testnet data is temporarily unavailable."}
          </span>
          <Button type="button" variant="outline" onClick={refresh} disabled={isLoading}>
            {isLoading ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : null}
      {!isLoading && !syncError && filteredJobs.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c14] p-10 text-center text-sm text-slate-500">
          No jobs match this status yet.
        </div>
      ) : null}
    </section>
  );
}
