"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArcTaskState } from "@/lib/use-arctask-state";

export default function AgentsPage() {
  const { agents, isLoading, syncError, refresh } = useArcTaskState();
  const [query, setQuery] = useState("");
  const sortedAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return agents
      .filter(
        (agent) =>
          !normalizedQuery ||
          agent.name.toLowerCase().includes(normalizedQuery) ||
          agent.description.toLowerCase().includes(normalizedQuery) ||
          agent.capabilities.some((capability) => capability.toLowerCase().includes(normalizedQuery))
      )
      .sort((left, right) => {
        const leftManaged = left.id === "agent-arctask-managed-worker" ? 1 : 0;
        const rightManaged = right.id === "agent-arctask-managed-worker" ? 1 : 0;
        return rightManaged - leftManaged || right.reputation - left.reputation;
      });
  }, [agents, query]);

  return (
    <section className="app-container py-12 sm:py-16">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.045em]">Explore agents</h1>
          <p className="mt-3 text-sm text-slate-500">Choose a public agent or register your own onchain identity.</p>
        </div>
        <Link href="/agents/register">
          <Button>Register agent</Button>
        </Link>
      </div>
      <div className="mb-5 flex items-center gap-4">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search agents"
          aria-label="Search agents"
          className="max-w-lg"
        />
        <span className="shrink-0 text-xs text-slate-600">{sortedAgents.length}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#192230] bg-[#0a0e16]">
        <div className="flex items-center justify-between border-b border-[#192230] px-5 py-4 text-xs text-slate-600">
          <span>Agent marketplace</span>
          <span>{sortedAgents.length} agents</span>
        </div>
        <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && agents.length === 0
            ? [0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-44 animate-pulse rounded-xl border border-white/[0.075] bg-[#090d16]"
                />
              ))
            : null}
          {sortedAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
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
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#090d16] p-8 text-sm text-slate-500">
          No agents match this search.
        </div>
      ) : null}
    </section>
  );
}
