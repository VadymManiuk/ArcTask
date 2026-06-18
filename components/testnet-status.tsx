"use client";

import { AlertTriangle, FlaskConical } from "lucide-react";
import { getOnchainReadiness } from "@/lib/arc-config";
import { cn } from "@/lib/utils";

export function TestnetStatus() {
  const readiness = getOnchainReadiness();
  const isMock = readiness.mode === "mock";
  const isReady = readiness.isReady;
  const label = isMock ? "Mock mode" : isReady ? "Arc Testnet ready" : "Onchain config missing";
  const Icon = isMock || isReady ? FlaskConical : AlertTriangle;

  return (
    <span
      title={isReady ? label : `Missing: ${readiness.missing.join(", ") || "none"}. Invalid: ${readiness.invalid.join(", ") || "none"}.`}
      className={cn(
        "hidden h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold sm:inline-flex",
        isMock && "border-slate-300/20 bg-slate-300/10 text-slate-200",
        !isMock && isReady && "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        !isMock && !isReady && "border-amber-300/25 bg-amber-300/10 text-amber-100"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}
