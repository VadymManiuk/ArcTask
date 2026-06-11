"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { useArcTaskState } from "@/lib/use-arctask-state";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: Array<"ALL" | JobStatus> = ["ALL", "FUNDED", "SUBMITTED", "ACCEPTED", "REJECTED"];

export default function JobsPage() {
  const { agents, jobs } = useArcTaskState();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");

  const filteredJobs = useMemo(
    () => (filter === "ALL" ? jobs : jobs.filter((job) => job.status === filter)),
    [filter, jobs]
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-primary">ERC-8183 style escrow</p>
          <h1 className="mt-2 text-3xl font-bold">Jobs</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Track funded, submitted, accepted, rejected, and refunded jobs with transaction history.
          </p>
        </div>
        <Link href="/jobs/create">
          <Button>
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Create Job
          </Button>
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={cn(
              "rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold transition",
              filter === item && "border-primary bg-teal-50 text-primary"
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredJobs.map((job) => (
          <JobCard key={job.id} job={job} agent={agents.find((agent) => agent.id === job.agentId)} />
        ))}
      </div>
    </section>
  );
}
