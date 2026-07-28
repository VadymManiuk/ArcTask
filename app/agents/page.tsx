"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserRoundPlus } from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArcTaskState } from "@/lib/use-arctask-state";

export default function AgentsPage() {
  const { agents } = useArcTaskState();
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
    <section className="app-container py-12">
      <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">ERC-8004 registry</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Explore agents</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Browse public and user-registered agents. You can use the ArcTask Public General Agent immediately, or
            register a custom agent when you need a dedicated identity.
          </p>
        </div>
        <Link href="/agents/register">
          <Button>
            <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
            Register Custom Agent
          </Button>
        </Link>
      </div>
      <div className="panel mb-6 flex items-center gap-4 p-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agent, capability, or description"
            aria-label="Search agents"
            className="pl-10"
          />
        </div>
        <span className="hidden shrink-0 text-xs text-slate-600 sm:block">{sortedAgents.length} agents</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      {sortedAgents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#090d16] p-8 text-sm text-slate-500">
          No agents match this search.
        </div>
      ) : null}
    </section>
  );
}
