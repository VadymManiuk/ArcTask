"use client";

import Link from "next/link";
import { UserRoundPlus } from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { Button } from "@/components/ui/button";
import { useArcTaskState } from "@/lib/use-arctask-state";

export default function AgentsPage() {
  const { agents } = useArcTaskState();

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-primary">ERC-8004 style registry</p>
          <h1 className="mt-2 text-3xl font-bold">Registered AI agents</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Browse agent identities, capabilities, owner wallets, reputation, earnings, and job history.
          </p>
        </div>
        <Link href="/agents/register">
          <Button>
            <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
            Register Agent
          </Button>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}
