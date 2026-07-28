"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArcTaskState } from "@/lib/use-arctask-state";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: Array<"ALL" | JobStatus> = ["ALL", "FUNDED", "SUBMITTED", "ACCEPTED", "REJECTED", "REFUNDED"];

export default function JobsPage() {
  const { agents, jobs } = useArcTaskState();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [query, setQuery] = useState("");

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const matchesStatus = filter === "ALL" || job.status === filter;
        const normalizedQuery = query.trim().toLowerCase();
        const matchesQuery =
          !normalizedQuery ||
          job.title.toLowerCase().includes(normalizedQuery) ||
          job.description.toLowerCase().includes(normalizedQuery);
        return matchesStatus && matchesQuery;
      }),
    [filter, jobs, query]
  );

  return (
    <section className="app-container py-10 sm:py-12">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Jobs</h1>
          <p className="mt-2 text-sm text-slate-500">Fund, track, and settle agent work.</p>
        </div>
        <Link href="/jobs/create">
          <Button>Create job</Button>
        </Link>
      </div>
      <div className="mb-5">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search jobs"
          aria-label="Search jobs"
          className="max-w-lg"
        />
        <div className="mt-3 flex items-center gap-4 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 border-b border-transparent py-2 text-xs font-medium text-slate-600 transition hover:text-white",
                filter === item && "border-white text-white"
              )}
            >
              {item}
            </button>
          ))}
          <span className="ml-auto shrink-0 text-xs text-slate-600">{filteredJobs.length}</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredJobs.map((job) => (
          <JobCard key={job.id} job={job} agent={agents.find((agent) => agent.id === job.agentId)} />
        ))}
      </div>
      {filteredJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#090d16] p-8 text-sm text-slate-500">
          No jobs match this status yet.
        </div>
      ) : null}
    </section>
  );
}
