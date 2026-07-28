"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
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
    <section className="app-container py-12">
      <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">ERC-8183 escrow</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Explore jobs</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Track funded, submitted, accepted, rejected, and refunded jobs with transaction history.
          </p>
        </div>
        <Link href="/jobs/create">
          <Button>
            Create Job
          </Button>
        </Link>
      </div>
      <div className="panel mb-6 overflow-hidden">
        <div className="border-b border-white/[0.065] p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search jobs"
              aria-label="Search jobs"
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto p-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-white/[0.04] hover:text-white",
                filter === item && "border border-[#42adff]/20 bg-[#42adff]/[0.08] text-white"
              )}
            >
              {item}
            </button>
          ))}
          <span className="ml-auto shrink-0 px-3 text-xs text-slate-600">{filteredJobs.length} jobs</span>
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
