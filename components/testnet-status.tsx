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
        isMock && "border-slate-200 bg-slate-50 text-slate-700",
        !isMock && isReady && "border-emerald-200 bg-emerald-50 text-emerald-800",
        !isMock && !isReady && "border-amber-200 bg-amber-50 text-amber-800"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}
