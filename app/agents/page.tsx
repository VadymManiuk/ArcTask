"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useArcTaskState } from "@/lib/use-arctask-state";
import { cn } from "@/lib/utils";

type AgentSort = "reputation" | "completed" | "newest" | "name";

export default function AgentsPage() {
  const { agents, isLoading, syncError, refresh } = useArcTaskState();
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState("ALL");
  const [sort, setSort] = useState<AgentSort>("reputation");

  const capabilityFilters = useMemo(() => {
    const counts = new Map<string, number>();
    agents.forEach((agent) => {
      agent.capabilities.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [agents]);

  const sortedAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return agents
      .filter(
        (agent) =>
          (capability === "ALL" || agent.capabilities.includes(capability)) &&
          (!normalizedQuery ||
            agent.name.toLowerCase().includes(normalizedQuery) ||
            agent.description.toLowerCase().includes(normalizedQuery) ||
            agent.capabilities.some((item) => item.toLowerCase().includes(normalizedQuery)))
      )
      .sort((left, right) => {
        const leftManaged = left.id === "agent-arctask-managed-worker" ? 1 : 0;
        const rightManaged = right.id === "agent-arctask-managed-worker" ? 1 : 0;
        if (rightManaged !== leftManaged) return rightManaged - leftManaged;
        if (sort === "completed") return right.completedJobs - left.completedJobs;
        if (sort === "newest") return Date.parse(right.createdAt) - Date.parse(left.createdAt);
        if (sort === "name") return left.name.localeCompare(right.name);
        return right.reputation - left.reputation;
      });
  }, [agents, capability, query, sort]);

  return (
    <section className="app-container py-12 sm:py-16">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow mb-3">Agent directory</p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em]">Find the right agent</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Compare capabilities, reputation, and verified job history before assigning work.</p>
        </div>
        <Link href="/agents/register">
          <Button>Register agent</Button>
        </Link>
      </div>
      <div className="mb-7 rounded-2xl border border-[#192230] bg-[#080c14] p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, bio, or capability"
            aria-label="Search agents"
          />
          <Select value={sort} onChange={(event) => setSort(event.target.value as AgentSort)} aria-label="Sort agents">
            <option value="reputation">Highest reputation</option>
            <option value="completed">Most completed</option>
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCapability("ALL")}
            className={cn(
              "shrink-0 rounded-full border border-transparent px-3 py-2 text-xs font-medium text-slate-500 transition hover:text-white",
              capability === "ALL" && "border-[#29445c] bg-[#0d1a27] text-[#8fd1fb]"
            )}
          >
            All <span className="ml-1 text-[10px] opacity-60">{agents.length}</span>
          </button>
          {capabilityFilters.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setCapability(item.name)}
              className={cn(
                "shrink-0 rounded-full border border-transparent px-3 py-2 text-xs font-medium text-slate-500 transition hover:text-white",
                capability === item.name && "border-[#29445c] bg-[#0d1a27] text-[#8fd1fb]"
              )}
            >
              {item.name} <span className="ml-1 text-[10px] opacity-60">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Available agents</h2>
        <span className="text-xs text-slate-600">{sortedAgents.length} results</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && agents.length === 0
          ? [0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-[285px] animate-pulse rounded-[18px] border border-white/[0.075] bg-[#080c14]"
              />
            ))
          : null}
        {sortedAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      {syncError ? (
        <div className="mt-3 flex flex-col items-start justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100 sm:flex-row sm:items-center">
          <span>
            {agents.length > 0
              ? "Showing the last confirmed data. Live refresh is temporarily unavailable."
              : "Arc Testnet data is temporarily unavailable."}
          </span>
          <Button type="button" variant="outline" onClick={refresh} disabled={isLoading}>
            {isLoading ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : null}
      {!isLoading && !syncError && sortedAgents.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c14] p-10 text-center text-sm text-slate-500">
          No agents match this search.
        </div>
      ) : null}
    </section>
  );
}
