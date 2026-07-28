"use client";

import { AlertTriangle, Radio } from "lucide-react";
import { getOnchainReadiness } from "@/lib/arc-config";
import { cn } from "@/lib/utils";

export function TestnetStatus() {
  const readiness = getOnchainReadiness();
  const isMock = readiness.mode === "mock";
  const isReady = readiness.isReady;
  const label = isMock ? "Mock mode" : isReady ? "Arc Testnet ready" : "Onchain config missing";
  const Icon = isMock || isReady ? Radio : AlertTriangle;

  return (
    <span
      title={isReady ? label : `Missing: ${readiness.missing.join(", ") || "none"}. Invalid: ${readiness.invalid.join(", ") || "none"}.`}
      className={cn(
        "hidden h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium sm:inline-flex",
        isMock && "border-slate-300/10 bg-[#090d15] text-slate-400",
        !isMock && isReady && "border-[#42adff]/15 bg-[#42adff]/[0.06] text-[#65bbff]",
        !isMock && !isReady && "border-amber-300/20 bg-amber-300/[0.07] text-amber-200"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}
