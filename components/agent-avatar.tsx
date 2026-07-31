"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

type AgentAvatarData = Pick<Agent, "id" | "name" | "capabilities" | "avatarUrl">;

const palettes = {
  research: { background: "#e8f6ff", primary: "#0784c7", secondary: "#38bdf8" },
  security: { background: "#f1edff", primary: "#6d4bd1", secondary: "#a78bfa" },
  quality: { background: "#eafbf2", primary: "#12845a", secondary: "#4ade80" },
  writing: { background: "#fff6df", primary: "#b96707", secondary: "#fbbf24" },
  payments: { background: "#e7faf7", primary: "#0f766e", secondary: "#2dd4bf" },
  operations: { background: "#eef2ff", primary: "#4f46b8", secondary: "#818cf8" },
  governance: { background: "#fff0f5", primary: "#b42361", secondary: "#fb7185" },
  general: { background: "#eaf5ff", primary: "#1479b8", secondary: "#60a5fa" }
} as const;

function hashSeed(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function getPalette(agent: AgentAvatarData) {
  const specialization = `${agent.name} ${agent.capabilities.join(" ")}`.toLowerCase();
  if (/audit|security|contract|risk|solidity/.test(specialization)) return palettes.security;
  if (/qa|quality|test|validation/.test(specialization)) return palettes.quality;
  if (/write|documentation|content|runbook/.test(specialization)) return palettes.writing;
  if (/payment|treasury|invoice|settlement/.test(specialization)) return palettes.payments;
  if (/devops|integration|api|reliability|observability/.test(specialization)) return palettes.operations;
  if (/governance|compliance|policy|control/.test(specialization)) return palettes.governance;
  if (/research|analysis|data|market/.test(specialization)) return palettes.research;
  return palettes.general;
}

export function AgentAvatar({ agent, className }: { agent: AgentAvatarData; className?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const seed = useMemo(
    () => hashSeed(`${agent.id}:${agent.name}:${agent.capabilities[0] ?? "general"}`),
    [agent.capabilities, agent.id, agent.name]
  );
  const palette = getPalette(agent);

  useEffect(() => {
    setImageFailed(false);
  }, [agent.avatarUrl]);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#23405a] bg-[#0c1a27]",
        className
      )}
      style={{ backgroundColor: palette.background }}
    >
      {agent.avatarUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.avatarUrl}
          alt={`${agent.name} avatar`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <GeneratedAgentMark seed={seed} palette={palette} />
      )}
    </span>
  );
}

function GeneratedAgentMark({
  seed,
  palette
}: {
  seed: number;
  palette: { background: string; primary: string; secondary: string };
}) {
  const variant = seed % 4;
  const dotX = 19 + (seed % 10);
  const dotY = 17 + ((seed >>> 4) % 12);

  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="25" fill="none" stroke={palette.secondary} strokeOpacity="0.2" strokeWidth="1.5" />
      {variant === 0 ? (
        <>
          <path d="M15 40C20 22 31 14 48 18" fill="none" stroke={palette.primary} strokeLinecap="round" strokeWidth="5" />
          <path d="M20 47C31 42 41 33 45 23" fill="none" stroke={palette.secondary} strokeLinecap="round" strokeWidth="2.5" />
        </>
      ) : null}
      {variant === 1 ? (
        <>
          <path d="M16 34C23 17 41 16 49 30" fill="none" stroke={palette.primary} strokeLinecap="round" strokeWidth="5" />
          <path d="M19 43C31 49 43 44 47 35" fill="none" stroke={palette.secondary} strokeLinecap="round" strokeWidth="2.5" />
        </>
      ) : null}
      {variant === 2 ? (
        <>
          <path d="M18 46C17 29 26 17 43 16" fill="none" stroke={palette.primary} strokeLinecap="round" strokeWidth="5" />
          <path d="M27 48C42 44 49 34 46 21" fill="none" stroke={palette.secondary} strokeLinecap="round" strokeWidth="2.5" />
        </>
      ) : null}
      {variant === 3 ? (
        <>
          <path d="M16 27C27 14 43 18 49 32" fill="none" stroke={palette.primary} strokeLinecap="round" strokeWidth="5" />
          <path d="M18 37C26 49 42 48 48 38" fill="none" stroke={palette.secondary} strokeLinecap="round" strokeWidth="2.5" />
        </>
      ) : null}
      <path d={`M${dotX} ${dotY + 24}L${50 - (seed % 8)} ${18 + ((seed >>> 8) % 8)}`} stroke={palette.primary} strokeOpacity="0.28" strokeWidth="1.5" />
      <circle cx={dotX} cy={dotY} r="3.5" fill={palette.primary} />
      <circle cx={46 - (seed % 7)} cy={42 - ((seed >>> 6) % 8)} r="2.5" fill={palette.secondary} />
    </svg>
  );
}
